const fs = require("fs");
const URL = require("url");
const moment = require("moment");
const async = require("async");
const TelegramBot = require("node-telegram-bot-api");
const affiliated = require((process.env.DATA_DIR || "../data/")+"affiliated.json");

let bot;
let admins = [];
let token = (function(){
	try {
		let tokens = fs.readFileSync((process.env.DATA_DIR || "./data/")+"tokens.json");
		return JSON.parse(tokens)[process.argv[2] || "prod"];
	} catch(e) {
		throw new Error(`Error while fetching or parsing tokens.json :: ${e}`);
	}
})();

if(process.argv[2] === "dev") {
	bot = new TelegramBot(token, { polling: true, });
	log(`getUpdates Started locally`);
} else {
	const _os = {
		port: process.env.OPENSHIFT_NODEJS_PORT,
		host: process.env.OPENSHIFT_NODEJS_IP,
		domain: process.env.OPENSHIFT_APP_DNS, 
	};
	bot = new TelegramBot(token, {
		webHook: {
			port: _os.port,
			host: _os.host,
		},
	});

	bot.setWebHook(_os.domain+":443/bot"+token);
	log(`webHook started on ${_os}`);
}

bot.getChatAdministrators("@techbinder").then(function(members){
	members.shift();
	members.forEach(uInfo => {
		admins.push({
			name: uInfo.user.username,
			id: uInfo.user.id,
		});
	});
});

String.prototype.splitByIndex = function (offset) {
	return [this.substring(0, offset - 1), this.substring(offset)];
};

const destinations = {
	channel: "-1001063811662", // techbinder suggest channel
	group:	"-1001060197562", // syra staff
};

/**
 * Splits a string (str) by the divisor (dv) and then returns an array with message and url
 *
 * @function match
 * @param {string} str - the string to be divided
 * @param {string|regex} dv - the divisor
 * @return {Array.Object} - Array containing both splitted parts of the string.
 */

function match(str, dv) {
	const string = str.split(dv);
	return [string.shift().trim(), (string.length >= 1 ? string.join(" ").trim() : "")];
}

/**
 * Removes an optional first character if it is an hash (#)
 *
 * @function removeHash
 * @param {string} str - string to be parsed
 * @return {string} - parsed string
 */

function removeHash(str) {
	return str.slice(Number(str.charAt(0) === "#"));
}

/**
 * Parses the objects returned by channel_post telegram event and retrieves the tags/topics
 *
 * @function extractTags
 * @param {string} text - message content
 * @param {Array} entities - Array of message entities
 * @see https://core.telegram.org/bots/api#messageentity
 * @returns {Object} - Object containing if the arguments matches topics and which ones, false and [] otherwise
 */

function extractTags(text, entities) {
	const hasTags = !!entities && entities.length && entities.some(entity => entity.type === "hashtag");
	const topics = [];
	const raw = [];

	if (hasTags) {
		entities.forEach(function getTags(entity) {
			if (entity.type === "hashtag") {
				let tag = text.substr(entity.offset, entity.length);
				topics.push(removeHash(tag.trim()).toLowerCase());
				raw.push(tag.trim().toLowerCase());
			}
		});
	}

	return {
		hasHashtags: hasTags,
		tags: topics,
		raw: raw,
	};
}

/**
 * Checks if the sender is an admin
 *
 * @function isAdmin
 * @param {number} match - sender id
 * @returns {boolean} - true if an admin is sending the message, false otherwise.
 */

function isAdmin(match) {
	return admins.some(admin => match === admin.id);
}

/**
 * Retrieves the admins ids
 *
 * @function getAdmin
 * @returns {(Array.string|Array.number)} - admins id in an array
 */

function getAdmins() {
	return admins.map(admin => admin.id);
}

/**
 * Gets user status if still follows and is not kicked
 *
 * @function isMember
 * @param {string} userStatus - ChatMember Telegram object
 * @returns {boolean}
 */

function isMember(userStatus) {
	return userStatus !== "left" && userStatus !== "kicked";
}

/**
 * Given a URL, returns its hostname without both protocol and www.
 *
 * @function getHostname
 * @param {string} url - the url to be parsed
 * @returns {string} - url-parsed hostname
 */

function getHostname(url) {
	const urlParsed = url.replace(/.+:\/\//ig, "").replace("www.", "");
	return URL.parse(`https://${urlParsed}`).hostname;
}

/**
 * Given a string, returns string itself with first letter capitalized.
 *
 * @function capitalize
 * @param {string} string - string to be capitalized
 * @returns {string} - capitalized string
 */

function capitalize(string) {
	return string.charAt(0).toUpperCase()+string.slice(1);
}

/**
 * Reads a JSON file and returns its json-parsed content
 *
 * @function getDataList
 * @param {string} path - path to open
 * @return {Promise} object
 */

function getDataList(path) {
	return new Promise((success, reject) => {
		fs.readFile(path, "utf-8", (err, data) => {
			if (err) return reject(err);
			let list;
			try {
				list = JSON.parse(data);
			} catch (e) {
				return reject(e);
			}
	
			return success(list);
		});
	});
}


/**
 * Sends message to specific target
 *
 * @function send
 * @param {Array.Object<string, (string|object)>}	dests - Array of targets and messages
 * @param {String}		dests.target - destination id
 * @param {String}		dests.content - the message to be sent.
 * @param {Object=}		dests.options - options to be added
 * @param {String=}		dests.options.parse_mode - telegram parse_mode
 * @param {Function=}	dests.options.callback - function to be executed at the end
 * @returns {Object} - status
 */

function send(...destData) {
	let messageIds = [];
	return new Promise(function(success, error) {
		async.each(destData, function(message, callback) {
			if (!message.target) {
				throw "Missing target.";
			}

			if (!message.content) {
				throw "Missing content.";
			}

			message.getMID = "getMID" in message && message.getMID ? message.getMID : false;
			const options = Object.assign({ parse_mode: "Markdown" }, message.options || {});

			bot.sendMessage(message.target, `${message.content}`, options).then(function(sent) {
				if (message.getMID) {
					messageIds.push(sent.message_id);
				}

				callback();
			});
		}, function(err) {
			if (err) {
				new AsyncError("utils.send", destData, err);
			}

			return success(messageIds);	
		});
	});
}

/**
 * Logs messages in a text file
 *
 * @function logAction
 * @param {String}		message - text to be logged
 * @param {Function=}	callback - to be executed at the end of file writing
 */

function log(message, callback = function(){}) {
	const date = moment().utc().add(1, "h").format("YYYY-MM-DD | HH:mm:ss");
	const log = `${date} - ${message}\n`;
	fs.appendFile((process.env.DATA_DIR || "data/")+"sublogs.txt", log, callback);
}

/**
 * Edits telegram message keyboard
 *
 * @function editKeyboard
 * @param {String}			message_id - tg message identificator
 * @param {(string|number)}	chat_id - chat identificator
 * @param {Array.Array.Object} inline_keyboard - Array of Arrays of Objects, one object per key
 * @see https://core.telegram.org/bots/api#inlinekeyboardmarkup
 */

function editKeyboard(message_id, chat_id, inline_keyboard) {
	bot.editMessageReplyMarkup({
		inline_keyboard,
	}, {
		chat_id, message_id,
	});
}

/**
 * Edits telegram message
 *
 * @function editMessage
 * @param {Object.<string, (string|number)>} [details={}] - data container
 * @param {(string|number)}	details.message_id - tg message identificator
 * @param {(string|number)}	details.chat_id - chat identificator
 * @param {Array.Array.Object} details.keyboard - Array of Arrays of Objects, one object per key
 * @see https://core.telegram.org/bots/api#inlinekeyboardmarkup
 */

function editMessage(details = {}) {
	if (!details.text) {
		throw "Missing text as parameter. Please, provide one."
	}
	if (!details.message_id) {
		throw "Missing message_id as parameter. Please, provide one."
	}
	if (!details.chat_id) {
		throw "Missing chat_id as parameter. Please, provide one."
	}

	const messageDetails = Object.assign({
		chat_id: details.chat_id,
		message_id: details.message_id,
		reply_markup: {},
	}, details.options || {});

	if (details.keyboard && Object.keys(details.keyboard).length) {
		Object.assign(messageDetails, {reply_markup: { inline_keyboard: details.keyboard || [], }});
	}

	bot.editMessageText(details.text, messageDetails);
}

/**
 * Checks if the user follows the channel
 *
 * @function isChannelMember
 * @param {string} channel - channel name or "~" (some) or "*" (all) for affiliated channels
 * @param {(string|number)} user - user id
 * @returns {promise}
 */

function isChannelMember(channel, user) {
	if (!user) { throw "Missing user id"; }
	return new Promise(success => {
		if (channel === "~") {
			async.someSeries(affiliated, function(ch, callback) {
				if (ch.enabled) {
					//@ must be ad position 0, so if it is not (== -1 or > 1) this is executed
					if (!ch.id && ch.username.indexOf("@")) { ch = `@${ch.username}`; }
					
					bot.getChatMember(ch.id || ch.username, user).then(function(result) {
						return callback(null, isMember(result.status));
					}).catch(function(e) {
						// this happens when user is not a member of channels
						return callback(null, false);
					});
				} else {
					return callback(null, false);
				}
			}, function(err, status) { success(status); });
		} else if(channel === "*") {
			async.every(affiliated, function(ch, callback) {
				if (ch.enabled) {
					if (!ch.id && ch.username.indexOf("@")) { ch = `@${ch.username}`; }
					bot.getChatMember(ch.id || ch.username, user).then(function(result) {
						return callback(null, isMember(result.status));
					}).catch(function(e) {
						// this happens when user is not a member of channels
						return callback(null, false);
					});
				} else {
					return callback(null, false);
				}
			}, function(err, status) { success(status); });
		} else {
			if (typeof channel === "string" && channel.indexOf("@")) { channel = `@${channel}`; }
			bot.getChatMember(channel, user).then(function(result) {
				return success(isMember(result.status));
			}).catch(function(e) {
				// this happens when user is not a member of channels
				return success(null, false);
			});
		}
	});
}

/**
 * Analyzes if a passed channel is an affiliated channel (so, it's users can receive posts from this channel) 
 *
 * @function isAffiliated
 * @param {(string|number)} channel
 * @returns {Boolean} - if the channel is affiliated or less
 */

function isAffiliated(channel) {
	if (typeof channel === "number") {
		return affiliated.some(ch => ch.id === channel);
	}

	if (channel.indexOf("@")) { channel = `@${channel}`; }
	return affiliated.some(ch => ch.username && ch.username === channel);
}

/**
 * Basic class errors
 *
 * @class CustomError
 * @classdesc custom errors template
 */

class CustomError extends Error {

	/**
     * Creates a new specific error
	 *
     * @param {string} showMessage - a template message for all the extended classes like QueryError.
     * @param {string} functionName - A human-reference to the function which caused error. It can be also such a placeholder
     * @param {Object|String[]} [argv={}] - function parameters which may have caused the error.
	 * @param {string} [error=""] - reported error from the function
     */

	constructor(showMessage, functionName, argv = {}, error = "No error message specified.") {
		super();
		this.message = ("\x1b[5m\x1b[41m" + showMessage + `\x1b[0m @ function \x1b[32m${functionName}\x1b[0m`);
		this.message += `
Error Message: \x1b[5m\x1b[41m${error}\x1b[0m
Arguments:\n`;
		if (!Array.isArray(argv)) {
			Object.keys(argv).forEach((param) => {
				this.message += `\t\x1b[33m${param}\x1b[0m => `;
				if (Array.isArray(argv[param])) {
					this.message += `[${argv[param].toString().replace(/,/g, ", ")}]\n`;
				} else {
					this.message += `${argv[param]}\n`;
				}
			})
		} else {
			this.message += `\t\x1b[33m[\x1b[0m ${argv.toString().replace(/,/g, ", ")}\x1b[33m]\x1b[0m`;
		}

		throw this.message;
	}
}

/**
 * Query errors class
 *
 * @class QueryError
 * @classdesc Query error class
 */

class QueryError extends CustomError {
	/**
	 * Creates a new Database query error
	 *
	 * @param {string} functionName - A human-reference to the function which caused error. It can be also such a placeholder
	 * @param {Object|String[]} [argv={}] - function parameters which may have caused the error.
	 * @param {string} [error=""] - reported error from the function
	*/

	constructor(functionName, argv = {}, error = "") {
		return super("Database query went wrong", functionName, argv, error);
	}
}

/**
 * Async ops. errors class
 *
 * @class AsyncError
 * @classdesc Async ops. errors class
 */

class AsyncError extends CustomError {
	/**
	 * Creates a new async operation error
	 *
	 * @param {string} functionName - A human-reference to the function which caused error. It can be also such a placeholder
	 * @param {Object|String[]} [argv={}] - function parameters which may have caused the error.
	 * @param {string} [error=""] - reported error from the function
	 */

	constructor(functionName, argv = {}, error = "") {
		return super("Async operation returned error", functionName, argv, error);
	}
}

class ArgsError extends CustomError {
	constructor(functionName, argv = {}, error = "") {
		return super("This function has unexpected arguments.", functionName, argv, error);
	}
}

/**
 * Basic class for every telegram response
 *
 * @class ReplyMarkup
 * @classdesc main class containing keyboard creation methods
 */

class ReplyMarkup {
	constructor() {
		this.keyboard = [];
	}

	/**
	 * Returns a reply_markup object
	 *
	 * @function summon
	 * @memberof ReplyMarkup
	 * @params {Object=} options
	 * @params {boolean=} options.forceValue - a value to be returned instead of the keyboard
	 * @params {Object=} options.reply - a set of properties to be returned within the reply_markup
	 * @returns {Object} - reply_markup
	 * @see https://core.telegram.org/bots/api#sendmessage
	 */

	summon(options) {
		options = options || {};
		options.forceValue = options.forceValue || false;
		return {
			reply_markup: Object.assign({
				[this.type]: options.forceValue || this.keyboard,
			}, options.reply || {})
		}
	}

	/**
	 * Returns an object containing the property with the content or the content itself,
	 * depending on its argument.
	 *
	 * @function extract
	 * @memberof ReplyMarkup
	 * @params {!string} level - the deep of extraction of the values
	 * @returns {<Object|Object[][]>} - Object containing the keyboard content or the keyboard content itself
	 * @see https://core.telegram.org/bots/api#inlinekeyboardmarkup
	 */

	extract(level) {
		let summon = this.summon().reply_markup;
		if (level === "object") {
			return summon;
		}

		if (level === "content") {
			return summon[this.type];
		}

		throw "ReplyMarkup.extract: level not defined or not contains a valid value.";
	}
}

/**
 * Basic class for every inline keyboard
 *
 * @class InlineKeyboard
 * @classdesc main class containing inline keyboards creation
 * @params {Object} oneElement - one Telegram Inline Keyboard button to insert in the first line
 * @see https://core.telegram.org/bots/api#inlinekeyboardbutton
 */

class InlineKeyboard extends ReplyMarkup {

	constructor(oneElement) {
		super();
		if (oneElement && typeof oneElement === "object" && "text" in oneElement) {
			this.keyboard.push([oneElement]);
		}

		this.type = "inline_keyboard";
	}


	/**
	 * Adds a new row to the keyboard. Accepts all the keys to be pushed in that row.
	 *
	 * @member addRow
	 * @param {...Object} keys - Telegram's Inline Keyboard buttons
	 * @see https://core.telegram.org/bots/api#inlinekeyboardbutton
	 * @returns {Object} - new object with InlineKeyboard as prototype to allow methods concatenation and get this row length
	 */

	addRow(...keys) {
		this.keyboard.push([]);
		keys.forEach((key, index) => {
			if ("text" in key) {
				this.keyboard[this.keyboard.length-1].push(key);
			}
		});
		return Object.create(this, {
			length: {
				configurable: false,
				get: function() { return this.keyboard.length }
			}
		});
	}

	/**
	 * Pushes a new button to a specific row.
	 *
	 * @member push
	 * @param {number} rowIndex - row into which the button will be added; if negative, it link to the last row.
	 * @param {Object} element - element to be added
	 * @returns {Object} - InlineKeyboard
	 */

	push(rowIndex, element) {
		if (rowIndex < 0) {
			rowIndex = this.keyboard.length-1;
		}

		if (rowIndex > this.keyboard.length-1) {
			throw RangeError("rowIndex is greater than keyboard rows length");
		}

		if (Array.isArray(element)) {
			throw TypeError("Cannot add an array of elements to the keyboard.")
		}

		this.keyboard[rowIndex].push(element);
		return this;
	}

	/**
	 * Removes a row from the keyboard
	 *
	 * @member removeRow
	 * @param {number} rowIndex - index of the row to be removed
	 * @returns {Object} - new object with InlineKeyboard as prototype to allow methods concatenation and the length of this row
	 */

	removeRow(rowIndex) {
		if (rowIndex > this.keyboard.length-1) {
			throw RangeError("rowIndex is greater than keyboard rows length");
		}

		this.keyboard.splice(rowIndex, 1);
		return Object.create(this, {
			length: {
				configurable: false,
				get: function() { return this.keyboard.length }
			}
		});
	}

	/**
	 * Removes row content
	 *
	 * @member emptyRow
	 * @param {number} rowIndex - index of the row to be emptied
	 * @returns {Object} - InlineKeyboard
	 */

	emptyRow(rowIndex) {
		if (rowIndex > this.keyboard.length-1) {
			throw RangeError("rowIndex is greater than keyboard rows length");
		}

		this.keyboard[rowIndex] = [];
		return this;
	}

	/**
	 * Pops out the last row
	 *
	 * @member popRow
	 * @returns {Object} - new object with InlineKeyboard as prototype to allow methods concatenation and the length of this row
	 */

	popRow() {
		this.keyboard.pop();
		return Object.create(this, {
			length: {
				configurable: false,
				get: function() { return this.keyboard.length }
			}
		});
	}

	/**
	 * Removes last element of a row
	 *
	 * @member pop
	 * @param {number} rowIndex - index of the target row
	 * @returns {Object} - InlineKeyboard
	 */

	pop(rowIndex) {
		if (rowIndex > this.keyboard.length-1) {
			throw RangeError("rowIndex is greater than keyboard rows length");
		}

		this.keyboard[rowIndex].pop();
		return this;
	}

	/**
	 * Retrieves a row length
	 *
	 * @member rowLength
	 * @param {number} rowIndex - index of the target row
	 * @returns {number} - target row's length
	 */

	rowLength(rowIndex) {
		if (rowIndex < 0) {
			rowIndex = this.keyboard.length-1;
		}
		return this.keyboard[rowIndex].length;
	}

	get length() {
		return this.keyboard.length;
	}
}


/**
 * Basic class for every Reply Keyboard
 *
 * @class Keyboard
 * @classdesc main class containing reply keyboards creation
 */

class Keyboard extends ReplyMarkup {
	constructor(...keys) {
		super();
		this.keys = [];
		if (keys && keys.length) {
			this.keyboard.push([]);
			keys.forEach((key) => {
				this.keyboard[this.keyboard.length-1].push(key);
				this.keys.push(key);
			});
		}
	}

	addRow(...keys) {
		this.keyboard.push([]);
		keys.forEach((key) => {
			this.keyboard[this.keyboard.length-1].push(key);
			this.keys.push(key);
		});
	}

	/**
	 * Creates a new reply keyboard
	 *
	 * @member open
	 * @returns {Object} - reply markup object
	 * @see https://core.telegram.org/bots/api#replykeyboardmarkup
	 */

	open() {
		this.type = "keyboard";
		return this.summon({
			forceValue: false,
			reply: {
				resize_keyboard: true,
			}
		});
	}

	/**
	 * Closes the opened reply keyboard
	 *
	 * @member close
	 * @returns {Object} - reply markup object
	 * @see https://core.telegram.org/bots/api#replykeyboardremove
	 */

	close() {
		this.type = "remove_keyboard";
		return this.summon({ forceValue: true });
	}

	get getKeys() {
		return this.keys;
	}
}

module.exports = {
	bot,
	log,
	send,
	match,
	isAdmin,
	getAdmins,
	capitalize,
	getDataList,
	getHostname,
	editMessage,
	removeHash,
	extractTags,
	editKeyboard,
	destinations,
	Keyboard,
	InlineKeyboard,
	isChannelMember,
	isAffiliated,
	QueryError,
	AsyncError,
	ArgsError,
};
