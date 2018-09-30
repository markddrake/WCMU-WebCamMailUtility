/* ================================================  
 *    
 * Copyright (c) 2016 Oracle and/or its affiliates.  All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * ================================================
 */

"use strict";
 
var http = require('http');
var request = require('request');
var mailer = require('nodemailer');
var fs = require('fs');

var transporter
var ImageMailerConfig         
var EventSchedule
var LastInterval

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
  if ((ImageMailerConfig === undefined) || (level <= ImageMailerConfig.logLevel)) {
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

function processEvents(callback) {

  var moduleId = "processEvents";	
  var now = new Date();  

  try {
    if (EventSchedule.length > 0) {
 	  var now = new Date();
	  while (EventSchedule[0] <= now) {
        var nextEvent = EventSchedule.shift();
		if (nextEvent > LastInterval) {
		  writeLogEntry(2,moduleId,"Processing Event Scheduled for " + nextEvent.toISOString());
		  callback();
		}
		else {
		  writeLogEntry(0,moduleId,"Skipping Event Scheduled for " + nextEvent.toISOString());
		}
	  }
    }
    if (LastInterval.getHours() > now.getHours()) {
	  loadConfigurationFile(); 
    }  
  } catch (e) {
    writeLogEntry(0,moduleId,e.stack)
  }
  LastInterval = now;
}

function convertToDate(time) {

  var moduleId = "convertToDate"

  var hms = time.split(":");
  while (hms.length < 2) {
	  hms.push("0");
  }

  var target = new Date()
  target.setHours(parseInt(hms[0]));
  target.setMinutes(parseInt(hms[1]));
  target.setSeconds(0);
  target.setMilliseconds(0);
  
  return target;
 
}

function orderEvents(times) {
	
  var moduleId = "orderEvents";

  EventSchedule = new Array(times.length);

  writeLogEntry(2,moduleId,'Scheduling ' + EventSchedule.length + " events.");
  
  
  for (var i = 0; i < times.length; i++) {
    EventSchedule[i] = convertToDate(times[i])
    writeLogEntry(2,moduleId,"Event scheduled for " + EventSchedule[i].toISOString());
  }
	
  EventSchedule.sort(function(a,b) {return a-b});	
}

function loadConfigurationFile() {

  var moduleId = "loadConfigurationFile";

  var configData = fs.readFileSync(__dirname + '/ImageMailer.json');
  ImageMailerConfig = JSON.parse(configData);
  LastInterval = new Date();  
  orderEvents(ImageMailerConfig.schedule.times);
  
}

function startIntervalTimer(callback) {
	
    var moduleId = "startIntervalTimer";
	
	var startTime = new Date();
	startTime.setSeconds(0);
	startTime.setMilliseconds(0);
	startTime.setTime(startTime.getTime() + (60 * 1000));

    var startTimeWait = startTime - (new Date()).getTime();
	writeLogEntry(2,moduleId,"Starting Interval Timer in " + startTimeWait + "ms.")
	
	setTimeout(
	  function() {
       setInterval(processEvents,60000,callback)
	   writeLogEntry(0,moduleId,"Interval Timer Active.")
	  },
	  startTimeWait
	)
	
}

function main() {

  var moduleId = "main"
	
  try {
	loadConfigurationFile();
    initializeMailer(ImageMailerConfig.email.service,ImageMailerConfig.email.sender,ImageMailerConfig.email.password);
	startIntervalTimer(emailSnapshot);
  } catch (e) {
	writeLogEntry(0,moduleId,"Uncaught Error");
	writeLogEntry(0,moduleId,e.stack);
  }
}


main();