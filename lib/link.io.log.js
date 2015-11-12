var fs = require('fs')
var schedule = require('node-schedule');
var logFileName = "";
var logStream;
var Log = {};

var onLogFileChanged = function() {};

Log.build = function(cb) {
    if(typeof cb != 'undefined')
        onLogFileChanged = cb;

    updateLogOutput();

    //Change log file everyday at 0:00 AM
    schedule.scheduleJob('0 0 * * *', function(){
        updateLogOutput();
    });

    return new _Log();
};

function _Log() {}


/**
 * Log function
 * TODO: Log in a file
 * @param str String to log
 * @param type log's TYPE
 * @param level log's LEVEL
 *
 */
_Log.prototype.log = function(str, type, level) {
    // Print depends of the type
    if(type == Log.TYPE.INFO)
        console.log(type.name + ' ' + level.name + ' ' + str);
    else if(type == Log.TYPE.ERROR) {
        logStream.write(getDatePrefix(false) + ' ERROR ' + str.stack + '\n');
        console.log('ERROR ' + str.stack);
    }

    //Put only INFO log into file
    if(type == Log.TYPE.INFO && level != 'undefined')
        logStream.write(getDatePrefix(false) + ' ' + type.name + ' ' + level.name + ' ' + str + '\n');
}

/**
 * Log type (string or event)
 * @type {{INFO: {value: number, name: string}, EVENT: {value: number, name: string}}}
 */
Log.TYPE = {
    INFO : {value: 0, name: "INFO"},
    EVENT: {value: 1, name: "EVENT"},
    ERROR: {value: 2, name: "ERROR"},
};

/**
 * Log level
 * @type {{DEBUG: {value: number, name: string}, WARNING: {value: number, name: string}, ERROR: {value: number, name: string}}}
 */
Log.LEVEL = {
    DEBUG  : {value: 1, name: "DEBUG"},
    WARNING: {value: 2, name: "WARNING"},
    ERROR  : {value: 3, name: "ERROR"}
};

module.exports = Log;

/**
 * Open a new log file
 */
function updateLogOutput() {
    var now = new Date();
    logFileName = (now.getMonth()+1) + '_' + now.getDate() + '_'  + now.getFullYear() + '.log';
    logStream =  fs.createWriteStream(__dirname + "/../log/" + logFileName, {'flags': 'a'});
    onLogFileChanged(logFileName);
}


function getDatePrefix(ms) {

    var d = new Date();
    var date_str = '[' + d.getFullYear()                                         + '-' +
        ((d.getMonth() + 1) < 10 ? '0' : '') + (d.getMonth() + 1) + '-' +
        (d.getDate()       < 10 ? '0' : '') + d.getDate()        + ' ' +
        (d.getHours()      < 10 ? '0' : '') + d.getHours()       + ':' +
        (d.getMinutes()    < 10 ? '0' : '') + d.getMinutes()     + ':' +
        (d.getSeconds()    < 10 ? '0' : '') + d.getSeconds()     +
        (ms ? ':' + minDigits(d.getMilliseconds(), 3) : '') + ']';

    return date_str;

}

function minDigits(n, digits) {

    var str = n + '';
    var length = str.length;
    var i = 0;
    while(i < (digits - length)) {
        str = '0' + str;
        i++;
    }

    return str + '';

}