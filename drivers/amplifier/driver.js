var net = require('net');
var tempIP = '';
var telnetPort = 8102;
var allPossibleInputs = [{
	inputName: "25FN",
	friendlyName: "BD"
}, {
	inputName: "04FN",
	friendlyName: "DVD"
}, {
	inputName: "15FN",
	friendlyName: "DVR/BDR"
}, {
	inputName: "06FN",
	friendlyName: "SAT/CBL"
}, {
	inputName: "FN49",
	friendlyName: "GAME"
}, {
	inputName: "01FN",
	friendlyName: "CD"
}, {
	inputName: "05FN",
	friendlyName: "TV"
}, {
	inputName: "02FN",
	friendlyName: "Tuner"
}, {
	inputName: "38FN",
	friendlyName: "Internet Radio"
}, {
	inputName: "45FN",
	friendlyName: "Favorites"
}, {
	inputName: "17FN",
	friendlyName: "iPod/USB"
}, {
	inputName: "10FN",
	friendlyName: "VIDEO 1"
}, {
	inputName: "14FN",
	friendlyName: "VIDEO 2"
}, {
	inputName: "19FN",
	friendlyName: "HDMI1"
}, {
	inputName: "20FN",
	friendlyName: "HDMI2"
}, {
	inputName: "21FN",
	friendlyName: "HDMI3"
}, {
	inputName: "22FN",
	friendlyName: "HDMI4"
}, {
	inputName: "23FN",
	friendlyName: "HDMI5"
}, {
	inputName: "24FN",
	friendlyName: "HDMI6"
}, {
	inputName: "48FN",
	friendlyName: "MHL"
}, {
	inputName: "03FN",
	friendlyName: "CD-R/TAPE"
}, {
	inputName: "00FN",
	friendlyName: "PHONO"
}];
module.exports.pair = function(socket) {
	// socket is a direct channel to the front-end
	// this method is run when Homey.emit('list_devices') is run on the front-end
	// which happens when you use the template `list_devices`
	socket.on('list_devices', function(data, callback) {
		console.log("Pioneer app - list_devices tempIP is", tempIP);
		var devices = [{
			data: {
				id: tempIP,
				ipaddress: tempIP
			},
			name: tempDeviceName
		}];
		callback(null, devices);
	});
	// this is called when the user presses save settings button in start.html
	socket.on('get_devices', function(data, callback) {
		// Set passed pair settings in variables
		tempIP = data.ipaddress;
		tempDeviceName = data.deviceName;
		console.log("Pioneer app - got get_devices from front-end, tempIP =", tempIP);
		// FIXME: should check if IP leads to an actual Pioneer device
		// assume IP is OK and continue
		socket.emit('continue', null);
	});
	socket.on('disconnect', function() {
		console.log("Pioneer app - User aborted pairing, or pairing is finished");
	});
};
// flow action handlers
Homey.manager('flow').on('action.powerOn', function(callback, args) {
	var tempIP = args.device.ipaddress;
	console.log("Pioneer app - flow action powerOn, IP " + tempIP);
	powerOn(tempIP);
	callback(null, true); // we've fired successfully
});
Homey.manager('flow').on('action.powerOff', function(callback, args) {
	var tempIP = args.device.ipaddress;
	powerOff(tempIP);
	callback(null, true); // we've fired successfully
});
Homey.manager('flow').on('action.changeInput', function(callback, args) {
	var input = args.input.inputName;
	var tempIP = args.device.ipaddress;
	changeInputSource(tempIP, input);
	callback(null, true); // we've fired successfully
});
Homey.manager('flow').on('action.changeInput.input.autocomplete', function(callback, value) {
	var inputSearchString = value.query;
	var items = searchForInputsByValue(inputSearchString);
	callback(null, items);
});
Homey.manager('flow').on('action.volumeUp', function(callback, args) {
	var tempIP = args.device.ipaddress;
	var targetVolume = args.volume;
	volumeUp(tempIP, targetVolume);
	callback(null, true); // we've fired successfully
});
Homey.manager('flow').on('action.volumeDown', function(callback, args) {
	var tempIP = args.device.ipaddress;
	var targetVolume = args.volume;
	volumeDown(tempIP, targetVolume);
	callback(null, true); // we've fired successfully
});

function powerOn(hostIP) {
	var command = 'PO';
	sendCommand(hostIP, command);
}

function powerOff(hostIP) {
	var command = 'PF';
	sendCommand(hostIP, command);
}

function changeInputSource(hostIP, input) {
	var command = input;
	sendCommand(hostIP, command);
}

function volumeUp(hostIP, targetVolume) {
	var command = 'VU';
	for (var i = 0; i < parseInt(targetVolume); i++) {
		sendCommand(hostIP, command);
	}
}

function volumeDown(hostIP, targetVolume) {
	var command = 'VD';
	for (var i = 0; i < parseInt(targetVolume); i++) {
		sendCommand(hostIP, command);
	}
}
//

function sendCommand(hostIP, command) {
	console.log("Pioneer app - sending " + command + "\n to " + hostIP);
	var client = new net.Socket();
	client.connect(telnetPort, hostIP);
	client.write(command + "\r");
	client.end();
	client.on('error', function(err) {
		console.log('error:', err.message);
	});
}

function searchForInputsByValue(value) {
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
}