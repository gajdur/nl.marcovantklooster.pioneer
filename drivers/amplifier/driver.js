var net = require('net');
// Temporarily store the device's IP address and name. For later use, it gets added to the device's settings
var tempIP = '';
var tempDeviceName = '';
// Variable to hold responses from the AVR
var receivedData = "";
// The Pioneer IP network interface uses port 8102 as telnet port
var telnetPort = [8102, 23];
var telnetIndex = 0;
var defaultMultiplier = "0.4897959183673469";
// a list of devices, with their 'id' as key
// it is generally advisable to keep a list of
// paired and active devices in your driver's memory.
var devices = {};
var allPossibleInputs = [{
	inputName: "25FN\r",
	friendlyName: "BD"
}, {
	inputName: "04FN\r",
	friendlyName: "DVD"
}, {
	inputName: "15FN\r",
	friendlyName: "DVR/BDR"
}, {
	inputName: "06FN\r",
	friendlyName: "SAT/CBL"
}, {
	inputName: "FN49\r",
	friendlyName: "GAME"
}, {
	inputName: "01FN\r",
	friendlyName: "CD"
}, {
	inputName: "05FN\r",
	friendlyName: "TV"
}, {
	inputName: "02FN\r",
	friendlyName: "Tuner"
}, {
	inputName: "38FN\r",
	friendlyName: "Internet Radio"
}, {
	inputName: "45FN\r",
	friendlyName: "Favorites"
}, {
	inputName: "17FN\r",
	friendlyName: "iPod/USB"
}, {
	inputName: "10FN\r",
	friendlyName: "VIDEO 1"
}, {
	inputName: "14FN\r",
	friendlyName: "VIDEO 2"
}, {
	inputName: "19FN\r",
	friendlyName: "HDMI1"
}, {
	inputName: "20FN\r",
	friendlyName: "HDMI2"
}, {
	inputName: "21FN\r",
	friendlyName: "HDMI3"
}, {
	inputName: "22FN\r",
	friendlyName: "HDMI4"
}, {
	inputName: "23FN\r",
	friendlyName: "HDMI5"
}, {
	inputName: "24FN\r",
	friendlyName: "HDMI6"
}, {
	inputName: "48FN\r",
	friendlyName: "MHL"
}, {
	inputName: "03FN\r",
	friendlyName: "CD-R/TAPE"
}, {
	inputName: "00FN\r",
	friendlyName: "PHONO"
}];
// the `init` method is called when your driver is loaded for the first time
module.exports.init = function(devices_data, callback) {
	devices_data.forEach(function(device_data) {
		initDevice(device_data);
	});
	callback();
};
// start of pairing functions
module.exports.pair = function(socket) {
	// socket is a direct channel to the front-end
	// this method is run when Homey.emit('list_devices') is run on the front-end
	// which happens when you use the template `list_devices`
	socket.on('list_devices', function(device_data, callback) {
		callback(null, [device_data]);
	});
	socket.emit('continue', null);
};
// end pair
module.exports.added = function(device_data, callback) {
	initDevice(device_data);
	callback(null, true);
};
module.exports.renamed = function(device_data, new_name) {
	// run when the user has renamed the device in Homey.
	// It is recommended to synchronize a device's name, so the user is not confused
	// when it uses another remote to control that device (e.g. the manufacturer's app).
	Homey.log("Pioneer app - device renamed: " + JSON.stringify(device_data) + " new name: " + new_name);
	// update the devices array we keep
	devices[device_data.id].data.name = new_name;
};
module.exports.deleted = function(device_data, callback) {
	delete devices[device_data.id];
	callback(null, true);
};
// handling settings (wrench icon in devices)
module.exports.settings = function(device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback) {
	// run when the user has changed the device's settings in Homey.
	// changedKeysArr contains an array of keys that have been changed, for your convenience :)
	// always fire the callback, or the settings won't change!
	// if the settings must not be saved for whatever reason:
	// callback( "Your error message", null );
	// else callback( null, true );
	Homey.log('Pioneer app - Settings were changed: ' + JSON.stringify(device_data) + ' / ' + JSON.stringify(newSettingsObj) + ' / old = ' + JSON.stringify(oldSettingsObj) + ' / changedKeysArr = ' + JSON.stringify(changedKeysArr));
	try {
		changedKeysArr.forEach(function(key) {
			switch (key) {
			case 'settingIPAddress':
				Homey.log('Pioneer app - IP address changed to ' + newSettingsObj.settingIPAddress);
				// FIXME: check if IP is valid, otherwise return callback with an error
				break;
			case 'telnetPort':
				telnetPort.push(newSettingsObj.telnetPort);
				break;
			}
		});
	} catch (error) {
		callback(error, null);
	}
	try {
		if (newSettingsObj.volumeMultiplier === undefined || newSettingsObj.volumeMultiplier === null || newSettingsObj.volumeMultiplier.length === 0) {
			Homey.log('Pioneer app - Get maximum volume of ' + newSettingsObj.settingIPAddress);
			detectVolumeMultiplier(newSettingsObj.settingIPAddress, device_data, function(message, status) {
				if (status) {
					if (message !== null) {
						callback(null, true);
					} else {
						callback(message, status);
					}
				}
			});
		} else {
			callback(null, true);
		}
	} catch (error) {
		callback(error, null);
	}
};
// capabilities
module.exports.capabilities = {
	onoff: {
		get: function(device_data, callbackCapability) {
			getDeviceIP(device_data, function(deviceIP, status) {
				if (status) {
					powerOnOff(deviceIP, function(onoff) {
						Homey.log('Pioneer app - telling capability power of ' + deviceIP + ' is ' + (onoff ? 'on' : 'off'));
						callbackCapability(null, onoff);
					});
				} else {
					module.exports.setUnavailable(device_data, "Incorrect Pioneer device. Please re-add this device");
					return callbackCapability(null, false);
				}
			});
		},
		set: function(device_data, onoff, callbackCapability) {
			getDeviceIP(device_data, function(deviceIP, status) {
				if (status) {
					Homey.log('Pioneer app - Setting device_status of ' + deviceIP + ' to ' + (onoff ? 'power on' : 'power off'));
					if (onoff) {
						powerOn(deviceIP);
					} else {
						powerOff(deviceIP);
					}
					callbackCapability(null, onoff);
				} else {
					module.exports.setUnavailable(device_data, "Incorrect Pioneer device. Please re-add this device");
					return callbackCapability(null, false);
				}
			});
		}
	}
};
// end capabilities
// start flow action handlers
Homey.manager('flow').on('action.powerOn', function(callback, args) {
	powerOn(args.device);
	callback(null, true);
});
Homey.manager('flow').on('action.powerOff', function(callback, args) {
	powerOff(args.device);
	callback(null, true);
});
Homey.manager('flow').on('condition.powerOnOff', function(callback, args) {
	powerOnOff(args.device, function(onoff) {
		callback(null, onoff);
	});
});
Homey.manager('flow').on('action.changeInput', function(callback, args) {
	var input = args.input.inputName;
	changeInputSource(args.device, input);
	callback(null, true);
});
Homey.manager('flow').on('action.changeInput.input.autocomplete', function(callback, value) {
	var inputSearchString = value.query;
	var items = searchForInputsByValue(inputSearchString);
	callback(null, items);
});
Homey.manager('flow').on('action.volumeUp', function(callback, args) {
	var targetVolume = args.volume;
	volumeUp(args.device, targetVolume);
	callback(null, true);
});
Homey.manager('flow').on('action.volumeDown', function(callback, args) {
	var targetVolume = args.volume;
	volumeDown(args.device, targetVolume);
	callback(null, true);
});
Homey.manager('flow').on('action.changeVolume', function(callback, args) {
	changeVolume(args.device, args.volume);
	callback(null, true);
});
Homey.manager('flow').on('action.mute', function(callback, args) {
	var command = '';
	if (args.onoff === 'on') {
		command = 'MO\r';
	} else if (args.onoff === 'off') {
		command = 'MF\r';
	}
	if (command !== '') {
		sendCommandToDevice(args.device, command);
	}
	callback(null, true);
});
Homey.manager('flow').on('condition.muteOnOff', function(callback, args) {
	muteOnOff(args.device, function(onoff) {
		callback(null, onoff);
	});
});
var muteOnOff = function(hostIP, callback) {
		sendCommandToDevice(hostIP, '?M\r', function(receivedData) {
			// if the response contained "MUT1", the AVR was muted. Else it was unmuted.
			if (receivedData.indexOf("MUT0") > -1) {
				callback(true);
			} else if (receivedData.indexOf("MUT1") > -1) {
				callback(false);
			}
		});
	};
var powerOn = function(hostIP) {
		var command = 'PO\r';
		sendCommandToDevice(hostIP, command);
	};
var powerOff = function(hostIP) {
		var command = 'PF\r';
		sendCommandToDevice(hostIP, command);
	};
var powerOnOff = function(hostIP, callback) {
		sendCommandToDevice(hostIP, '?P\r', function(receivedData) {
			// if the response contained "PWR0", the AVR was on. Else it was probably in standby.
			if (receivedData.indexOf("PWR0") >= 0) {
				callback(true);
			} else {
				callback(false);
			}
		});
	};
var changeInputSource = function(hostIP, input) {
		var command = input;
		sendCommandToDevice(hostIP, command);
	};
var volumeUp = function(hostIP, targetVolume) {
		var command = 'VU\r';
		for (var i = 0; i < parseInt(targetVolume); i++) {
			setTimeout(function() {
				sendCommandToDevice(hostIP, command);
			}, i * 500);
		}
	};
var volumeDown = function(hostIP, targetVolume) {
		var command = 'VD\r';
		for (var i = 0; i < parseInt(targetVolume); i++) {
			setTimeout(function() {
				sendCommandToDevice(hostIP, command);
			}, i * 500);
		}
	};
var changeVolume = function(device_data, targetVolume) {
		var device = getDeviceByData(device_data);
		if (device.settings !== undefined) {
			var volumeMultiplier = 0.4897959183673469;
			if (device.settings.volumeMultiplier !== undefined && device.settings.volumeMultiplier !== null && device.settings.volumeMultiplier.length > 0) {
				volumeMultiplier = Number(device.settings.volumeMultiplier);
			}
			sendCommandToDevice(device_data, '?V\r', function(response) {
				var currentLevel = Number(response.replace(/^\D+/g, ''));
				var d3 = currentLevel * volumeMultiplier;
				var d4 = targetVolume - d3;
				if (d4 > 0.00) {
					volumeUp(device_data, Math.round(d4));
				} else if (d4 < 0.00) {
					volumeDown(device_data, Math.abs(Math.round(d4)));
				}
			});
		}
	};
var detectVolumeMultiplier = function(hostIP, device_data, callback) {
		var commands = [];
		for (var i = 0; i < 100; i++) {
			commands.push({
				command: 'VU\r',
				time: i * 333
			});
		}
		commands.push({
			command: '?V\r',
			time: (110 * 333)
		});
		for (var j = 0; j < 100; j++) {
			commands.push({
				command: 'VD\r',
				time: (j + 120) * 333
			});
		}
		for (var k = 0; k < 10; k++) {
			commands.push({
				command: 'VU\r',
				time: (k + 230) * 333
			});
		}
		for (var l = 0; l < commands.length; l++) {
			var command = commands[l];
			setTimeout(function(hostIP, device_data, command, callback) {
				if (command.command === 'VU\r' || command.command === 'VD\r') {
					sendCommand(hostIP, command.command);
				} else {
					sendCommand(hostIP, '?V\r', function(response) {
						var maxLevel = Number(response.replace(/^\D+/g, ''));
						Homey.log(JSON.stringify({
							'maxLevel': maxLevel
						}));
						var maxVolume = Math.floor((maxLevel / 2) - 1);
						Homey.log(JSON.stringify({
							'maxVolume': maxVolume
						}));
						var volumeMultiplier = maxVolume / maxLevel;
						Homey.log(JSON.stringify({
							'volumeMultiplier': volumeMultiplier
						}));
						module.exports.setSettings(device_data, {
							volumeMultiplier: volumeMultiplier.toString()
						}, function(err, settings) {
							if (err === null) {
								callback(volumeMultiplier, true);
							} else {
								callback(err, false);
							}
						});
					});
				}
			}, command.time, hostIP, device_data, command, callback);
		}
	};
var sendCommandToDevice = function(device, command, callbackCommand) {
		getDeviceIP(device, function(deviceIP, status) {
			if (status) {
				sendCommand(deviceIP, command, callbackCommand);
			}
		});
	};
var sendCommand = function(hostIP, command, callbackCommand) {
		// clear variable that holds data received from the AVR
		receivedData = "";
		// for logging strip last char which will be the newline \n char
		var displayCommand = command.substring(0, command.length - 1);
		//Homey.log("Pioneer app - sending " + displayCommand + " to " + hostIP);
		var client = new net.Socket();
		client.on('error', function(err) {
			Homey.log("Pioneer app - IP socket error: " + err.message);
			if (err.message.indexOf("ECONNREFUSED") >= 0) {
				telnetIndex++;
				if (telnetPort[telnetIndex] === undefined) {
					telnetIndex = 0;
				}
			}
		});
		client.connect(telnetPort[telnetIndex], hostIP);
		client.write(command);
		// get a response
		client.on('data', function(data) {
			var tempData = data.toString().replace("\r", "");
			//Homey.log("Pioneer app - got: " + tempData);
			receivedData += tempData;
		});
		// after a delay, close connection
		setTimeout(function() {
			receivedData = receivedData.replace("\r", "");
			//Homey.log("Pioneer app - closing connection, receivedData: " + receivedData);
			client.end();
			// if we got a callback function, call it with the receivedData
			if (callbackCommand && typeof(callbackCommand) === "function") {
				callbackCommand(receivedData);
			}
		}, 1000);
	};
var searchForInputsByValue = function(value) {
		// for now, consider all known Pioneer inputs
		var possibleInputs = allPossibleInputs;
		var tempItems = [];
		for (var i = 0; i < possibleInputs.length; i++) {
			var tempInput = possibleInputs[i];
			if (tempInput.friendlyName.toLowerCase().indexOf(value.toLowerCase()) >= 0) {
				tempItems.push({
					icon: "",
					name: tempInput.friendlyName,
					inputName: tempInput.inputName
				});
			}
		}
		return tempItems;
	};
var getDeviceIP = function(device, callback) {
		if (typeof device !== 'object' && typeof device !== 'undefined') {
			device = getDeviceByData(device);
		}
		if (device instanceof Error) {
			return callback(null, false);
		}
		var deviceIP = null;
		if (device.settings !== undefined && device.settings.settingIPAddress !== undefined) {
			deviceIP = device.settings.settingIPAddress;
		} else if (device.id !== undefined) {
			deviceIP = device.id;
		} else if (device !== undefined && device.data !== undefined && device.data.id !== undefined) {
			deviceIP = device.data.id;
		}
		callback(deviceIP, true);
	};
// a helper method to get a device from the devices list by it's device_data object
var getDeviceByData = function(device_data) {
		var device = null;
		if (typeof device_data !== 'undefined') {
			if (typeof device_data === 'object') {
				device = devices[device_data.id];
			} else {
				device = devices[device_data];
			}
		}
		if (typeof device === 'undefined' || device === null) {
			return new Error("invalid_device");
		} else {
			return device;
		}
	};
// a helper method to add a device to the devices list
var initDevice = function(device_data) {
		devices[device_data.id] = {};
		devices[device_data.id].state = {
			onoff: true
		};
		devices[device_data.id].data = device_data;
		module.exports.getSettings(device_data, function(err, settings) {
			devices[device_data.id].settings = settings;
			if (settings.telnetPort !== undefined && settings.telnetPort !== null && settings.telnetPort > 0) {
				telnetPort.push(settings.telnetPort);
			}
		});
	};