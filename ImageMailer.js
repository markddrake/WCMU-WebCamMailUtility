
"use strict";
 
var http = require('http');
var request = require('request');
var mailer = require('nodemailer');
var fs = require('fs');


var transporter
var ImageMailerConfig         

function getCameraSnapshotURL() {
	return  ImageMailerConfig.camera.hostname + ImageMailerConfig.camera.snapshotPath;
}

function initializeMailer(service,username,password) {

 transporter = mailer.createTransport({
      service : service
    , auth    : {
        user  : username
    ,   pass  : password
    }
  })

}

function writeLogEntry(level,module,message) {
  module = ( message === undefined) ? module : module + ": " + message
  if (level <= ImageMailerConfig.logLevel) {
	console.log(new Date().toISOString() + ": ImageManager." + module);
  }
}

// Create a new object, that prototypally inherits from the Error constructor

function getImageError(requestOptions,error) {
  return {
	name    : 'ImageError'
  , message : 'Unexpected Error while Accessing Camera'
  , details : requestOptions
  , error   : error
  }
}


function processSnapshot(requestOptions, response, body, resolve, reject) {
		
  var moduleId = 'processSnapshot()';
		
  var responseDetails = {
    module         : moduleId
  , requestOptions : requestOptions
  , statusCode     : response.statusCode
  , statusText     : http.STATUS_CODES[response.statusCode]
  , contentType    : response.headers["content-type"]
  , headers        : response.headers
  , body           : response.body
  , elapsedTime    : response.elapsedTime
  }
 
  if ((response.statusCode === 200) || (response.statusCode === 201)) {
	resolve(response);
  }
  else {
	writeLogEntry(3,moduleId,'Error. Status code = ' + sodaResponse.statusCode);
    response.stack = new Error().stack
    reject(getImageError(responseDetails));
  }
}
    
function captureSnapshot(url,username,password) {

  var moduleId = 'captureSnapshot()';
  
  var requestOptions = {
  	method   : 'GET'
  , uri      : url
  , headers  : {  
              "Authorization" : "Basic " + new Buffer(username + ":" + password).toString("base64")
             }
  , encoding :  null	
  , time     : true
  };

  return new Promise(function(resolve, reject) {
    writeLogEntry(3,'Executing Promise');
    request(requestOptions, function(error, response, body) {
 	  if (error) {
  	    reject(getImageError(requestOptions,error));
	  }
	  else {
	    processSnapshot(requestOptions, response, body, resolve, reject);
	  }
    }) 
  });
}

function mailSnapshot(data,sender,recipient,subject,filenamePrefix) {

	var moduleId = "mailSnapshot()"

	var timestamp = new Date();
	var timestampSuffix = timestamp.toISOString()
	timestampSuffix = timestampSuffix.replace(/-/g,'')
	timestampSuffix = timestampSuffix.replace(/:/g,'')
	timestampSuffix = timestampSuffix.replace(/\./g,'')
	
	var mailOptions = {
        from    : sender
      , to      : recipient
      , subject : subject
      , text: 'Image Attached'
      , attachments: [{
		  filename    : filenamePrefix + '-' + timestampSuffix + '.jpg' 
		, content     : data
		, contentType : 'image/jpeg'
		}]
	};

	// send mail with defined transport object
	transporter.sendMail(mailOptions, function(error, info){
      if (error) {
         writeLogEntry(0,moduleId,'Error: ' + error);
      }
	  else {
         writeLogEntry(0,moduleId,'Message sent. Status: ' + info.response);
      }
	})
} 
 
var emailSnapshot = function () {
  
  var moduleId = "emailSnapshot";  
   
  try {   
    captureSnapshot(getCameraSnapshotURL(),ImageMailerConfig.camera.username,ImageMailerConfig.camera.password).then(function(resp){
      writeLogEntry(1,moduleId,"Bytes Recieved: " + resp.body.length);
      mailSnapshot(resp.body,ImageMailerConfig.email.sender,ImageMailerConfig.email.recipient,ImageMailerConfig.email.subject,ImageMailerConfig.email.filenamePrefix)
    }).catch(function(e) {
  	  if (e instanceof Error) {
  	    writeLogEntry(0,moduleId, e.stack)
  	  }  
  	  else {
        writeLogEntry(0,moduleId, "Error : " + JSON.stringify(e));
  	  }
    });
  } catch (e) {
	writeLogEntry(0,moduleId,"Uncaught Error");
	writeLogEntry(0,moduleId,e.stack);
  }
}

function timeToWait(time) {

  var moduleId = "timeToWait"

  var hms = time.split(":");
  while (hms.length < 3) {
	  hms.push("0");
  }

  // Calculate Seconds to Wait using a Date object to handle Daylight Savings Time..
  
  var target = new Date()
  target.setHours(parseInt(hms[0]));
  target.setMinutes(parseInt(hms[1]));
  target.setSeconds(parseInt(hms[2]));
  target.setMilliseconds(0);
  
  var now = new Date();
  now.setMilliseconds(0);

  return target.getTime() - now.getTime();
  
}

function millisecondsToDate(timeInMilliseconds) {

  var now = new Date()
  now.setMilliseconds(0);
  var then = new Date(now.getTime() + timeInMilliseconds)
  return then;

}  

function scheduleEvent(callback,time) {
    var moduleId = "scheduleEvent"
	var waitMilliseconds = timeToWait(time);
	
	writeLogEntry(2,moduleId,"Scheduling Callback at " + millisecondsToDate(waitMilliseconds).toISOString() + " (" + waitMilliseconds + "ms.)");
	
	if (waitMilliseconds > 0) {
  	  setTimeout(callback,waitMilliseconds)
	}
}

var scheduleEvents = function (callback) {
	
  var moduleId = "scheduleEvents"
  try {
    var configData = fs.readFileSync(__dirname + '/ImageMailer.json');
    ImageMailerConfig = JSON.parse(configData);         
  
    writeLogEntry(2,moduleId,"Scheduling " + ImageMailerConfig.schedule.times.length + " events.")	
    for (var i = 0; i < ImageMailerConfig.schedule.times.length; i++) {
  	  scheduleEvent(callback,ImageMailerConfig.schedule.times[i])
    }
	
    var millisecondsToMidnight = timeToWait("24:00:00")
    writeLogEntry(2,moduleId,"Scheduling Scheduler at " + millisecondsToDate(millisecondsToMidnight).toISOString() + " (" + millisecondsToMidnight + "ms.)");
    setTimeout(scheduleEvents,millisecondsToMidnight,callback)
  } catch (e) {
	writeLogEntry(0,moduleId,"Uncaught Error");
	writeLogEntry(0,moduleId,e.stack);
  }
}

function main() {

  var moduleId = "main"
	
  try {
    var configData = fs.readFileSync(__dirname + '/ImageMailer.json');
    ImageMailerConfig = JSON.parse(configData);         
    initializeMailer(ImageMailerConfig.email.service,ImageMailerConfig.email.sender,ImageMailerConfig.email.password);
    // emailSnapshot()
    scheduleEvents(emailSnapshot)
  } catch (e) {
	writeLogEntry(0,moduleId,"Uncaught Error");
	writeLogEntry(0,moduleId,e.stack);
  }
}

main();
