/*
 Copyright (C) 2011-2017 J-C Prin. (jisse44)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>
	
    Modifications for TB78 by John Bieling (2020)
*/

var editEmailSubjectMain = {

	// communication with popup window
	// this is called within global context
	handleMessage: function(request, sender, sendResponse) {
		if (request && request.action) {
			switch (request.action) {
				case "requestData":
					sendResponse(editEmailSubjectMain.msg);
				break;
				case "requestUpdate":
					if (editEmailSubjectMain.msg.localMode) {
						editEmailSubjectMain.modifySubject(request);
					} else {
						editEmailSubjectMain.modifyRawMessage(request);
					}
				break;
			}
		}
	},
	
	modifySubject: function(request){
		// update the subject in Thunderbirds message database
		messenger.MessageModification.setSubjectOfMessage(editEmailSubjectMain.msg.id, request.newSubject);
	},
	
	modifyRawMessage: async function(request) {
		
		let raw = this.msg.raw
						.replace(/\r/g, "") //for RFC2822
						.replace(/\n/g, "\r\n");
		
		// extract the header section and include the linebreak belonging to the last header
		// prevent blank line into headers and binary attachments broken (thanks to Achim Czasch for fix)
		let headerEnd =raw.search(/\r\n\r\n/);
		let headers =raw.substring(0, headerEnd+2).replace(/\r\r/,"\r");
		let body = raw.substring(headerEnd+2);
		
		// update subject
		headers = headers.replace(/\nSubject: .*\r\n/, "\nSubject: " + unescape(encodeURIComponent(request.newSubject)) + "\r\n");

		// Some IMAP provider (for ex. GMAIL) doesn't register changes in source if the main headers
		// are not different from an existing message. To work around this limit, the "Date" field is 
		// modified, if necessary, adding a second to the time (or decreasing a second if second are 59)	
		if (await messenger.MessageModification.getMessageServerType(this.msg.id) == "imap") {
			try {
				console.log(this.msg.headers["date"][0]);
				let date = this.msg.headers["date"][0].replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
					var seconds = parseInt(p3) + 1; 
					if (seconds > 59) seconds = 58;
					if (seconds < 10) seconds = "0" + seconds.toString(); 
					return p1 + ":" + p2 + ":" + seconds});

				// update date
				headers = headers.replace(/\nDate: .*\r\n/, "\nDate: " + unescape(encodeURIComponent(date)) + "\r\n");
				headers = headers.replace(/\ndate: .*\r\n/, "\ndate: " + unescape(encodeURIComponent(date)) + "\r\n");
			} catch (e) {
				//silent catch
			}
		}
		
		// why?
		//headers = headers.replace(/^From - .+\r\n/, "");
		//headers = headers.replace(/X-Mozilla-Status.+\r\n/, "");
		//headers = headers.replace(/X-Mozilla-Status2.+\r\n/, "");
		//headers = headers.replace(/X-Mozilla-Keys.+\r\n/, "");

		// update or modify X-EditEmailSubject headers
		let now = new Date;
		let EditEmailSubjectHead = ("X-EditEmailSubject: " + now.toString()).replace(/\(.+\)/, "").substring(0,75);
		let EditEmailSubjectOriginal = ("X-EditEmailSubject-OriginalSubject: " + unescape(encodeURIComponent(this.msg.subject)));
		if (!headers.includes("\nX-EditEmailSubject: ")) {
			headers += EditEmailSubjectHead + "\r\n" + EditEmailSubjectOriginal + "\r\n";
		} else {
			headers = headers.replace(/\nX-EditEmailSubject: .+\r\n/,"\n" + EditEmailSubjectHead + "\r\n");
		}
		
		await messenger.MessageModification.updateMessage(this.msg.id, headers + body);	

		console.log("OLD  ==============================================================");
		console.log(this.msg.raw);
		console.log("NEW  ==============================================================");
		console.log(headers + body);				
	},

	edit: async function (info) {
		this.msg = {};
		this.msg.localMode = await editEmailSubjectPreferences.getPrefValue("localOnly");

		if (info.selectedMessages && info.selectedMessages.messages.length > 0) {
			let MessageHeader = info.selectedMessages.messages[0];
			this.msg.subject = MessageHeader.subject;
			this.msg.date = MessageHeader.date;
			this.msg.id = MessageHeader.id;
			this.msg.alreadyModified = false;

			// in remoteMode, if the header contains X-EditEmailSubject, we show a warning about being already modified
			if (!this.msg.localMode) {
				let full = await messenger.messages.getFull(this.msg.id);
				this.msg.headers = full.headers;
				this.msg.alreadyModified = this.msg.headers.hasOwnProperty("x-editemailsubject");				
				this.msg.raw = await messenger.messages.getRaw(this.msg.id);
			}


			messenger.runtime.onMessage.addListener(this.handleMessage);	
			this.msg.popupWindow = await messenger.windows.create({
				height: this.msg.alreadyModified ? 260 : 170,
				width: 500,
				url: "/content/editemailsubjectPopup.html",
				type: "popup"
			});
		} else {
			console.log("No Message Selected!");
		}
	}
};
