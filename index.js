const rpio = require('rpio');

var Service, Characteristic;

const CurrentDoorState = {
    Open: 0,
    Closed: 1,
    Opening: 2,
    Closing: 3,
    Stopped: 4
};

const TargetDoorState = {
    Open: 0,
    Closed: 1
};

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-garage-door-remote", "Garage Door Remote", GarageDoor);
};

function GarageDoor(log, config) {
	this.log = log;
    this.name = config.name;

    this.currentDoorState = CurrentDoorState.Closed;
    this.targetDoorState = TargetDoorState.Closed;
    this.timeoutIds = [];

    this.gpio = config.gpio;
    this.remotePressDuration = config["remote_press_duration"];
    this.doorMovementDuration = config["door_movement_duration"];
    this.doorAutoCloseDelay = config["door_auto_close_delay"]

    this.log("GPIO: " + this.gpio);
    this.log("REMOTE PRESS DURATION: " + this.remotePressDuration);
    this.log("DOOR MOVEMENT DURATION: " + this.doorMovementDuration);
    this.log("DOOR AUTO CLOSE DELAY: " + this.doorAutoCloseDelay);

    rpio.open(this.gpio, rpio.OUTPUT, rpio.LOW);
};

GarageDoor.prototype = {
	getServices() {	
        this.garageDoorService = new Service.GarageDoorOpener;
        
        this.garageDoorService
            .getCharacteristic(Characteristic.CurrentDoorState)
            .on('get', this.getCurrentDoorState.bind(this));

        this.garageDoorService
            .getCharacteristic(Characteristic.TargetDoorState)
            .on('get', this.getTargetDoorState.bind(this))
            .on('set', this.setTargetDoorState.bind(this));

		return [this.garageDoorService];
    },
    
    getCurrentDoorState(callback) {
        callback(null, this.currentDoorState);
    },

    getTargetDoorState(callback) {
        callback(null, this.targetDoorState);
    },

    setTargetDoorState(state, callback) {
        this.timeoutIds.forEach(function(id) {
            clearTimeout(id);
        });

        const isOpening = state == TargetDoorState.Open;

        if (isOpening) {
            this.log("Opening garage door...");
        } else {
            this.log("Closing garage door...");
        }
        
        this.updateTargetDoorState(state);
        this.updateCurrentDoorState(isOpening ? CurrentDoorState.Opening: CurrentDoorState.Closing); 
        
        this.log("\"Pressing\" button...");
        rpio.write(this.gpio, rpio.HIGH);

        // "Press" button for remotePressDuration 
        var id = setTimeout(function() {
            rpio.write(this.gpio, rpio.LOW);
            this.log("Button \"pressed\"");
        }.bind(this), this.remotePressDuration);

        this.timeoutIds.push(id);

        // Change current door state to open after doorMovementDuration
        var id = setTimeout(function() {
            this.updateCurrentDoorState(isOpening ? CurrentDoorState.Open : CurrentDoorState.Closed);

            if (isOpening) {
                this.log("Garage door opened");
            } else {
                this.log("Garage door closed");
            }
        }.bind(this), this.doorMovementDuration)

        this.timeoutIds.push(id);

        // Start closing door after doorAutoCloseDelay + doorMovementDuration
        if (isOpening) {
            var id = setTimeout(function () {
                this.log("Faking auto closing garage door...");
                this.updateTargetDoorState(TargetDoorState.Closed);
                this.updateCurrentDoorState(CurrentDoorState.Closing);

                var id = setTimeout(function () {
                    this.updateCurrentDoorState(CurrentDoorState.Closed);
                    this.log("Auto closing garage door faked");
                }.bind(this), this.doorMovementDuration);

                this.timeoutIds.push(id);
            }.bind(this), this.doorMovementDuration + this.doorAutoCloseDelay);

            this.timeoutIds.push(id);
        }

        callback(null);
    },

    updateCurrentDoorState(state) {
        this.currentDoorState = state;

        this.garageDoorService
            .getCharacteristic(Characteristic.CurrentDoorState)
            .updateValue(this.currentDoorState);
    },

    updateTargetDoorState(state) {
        this.targetDoorState = state;

        this.garageDoorService
            .getCharacteristic(Characteristic.TargetDoorState)
            .updateValue(this.targetDoorState);
    }
}