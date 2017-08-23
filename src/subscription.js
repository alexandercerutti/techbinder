const manager = require("./manager.js");
const async = require("async");
const utils = require("./utils.js");
const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

const ƒ = manager.ƒ;
const InlineKeyboard = utils.InlineKeyboard;
const Keyboard = utils.Keyboard;
const keyboards = { "first": new InlineKeyboard() };
const users = {};
const bot = utils.bot;

let creationQuery = `SELECT id, name_id as "name", show_name as "showName" FROM keyboard;`;

db.all(creationQuery, function(err, get) {
	if (err) {
		new utils.QueryError("creationQuery", {}, err);
	}

	/**
	 * Database query callback
	 * @function <anonymous>
	 * @param {String|Object|?} err - error, if available, null otherwise
	 * @param {Array} get - Array of objects, returning all the results of creationQuery
	 */

	for (let i=0; i<get.length; i++) {
		const newKey = {
			text: get[i].showName,
			callback_data: JSON.stringify({src: "subs", cmd: "nav", content: get[i].name})
		};

		if (!keyboards["first"].length || keyboards["first"].rowLength(-1) === 2) {
			keyboards["first"].addRow(newKey);
		} else {
			keyboards["first"].push(-1, newKey);
		}

		keyboards[get[i].name] = new InlineKeyboard();

		fillCategory(get[i]);
	}

	keyboards["first"].addRow({
		text: "Custom ✏️",
		callback_data: JSON.stringify({src: "subs", cmd: "action", content: "custom"})
	}, {
		text: "My subscriptions ✅",
		callback_data: JSON.stringify({src: "subs", cmd: "nav", content: "mysubs"})
	});

	function fillCategory(keyb) {

		let target = keyb.id;
		let name = keyb.name;

		/**
		 * Fills the categories keyboards with their keys/topics 
		 *
		 * @function fillCategory
		 * @param {String|Integer} index - index of the category
		 */

		/** Selecting all topics id and their formatted name for a specific keyboard **/

		let query = `SELECT topic.* FROM KB_match
					JOIN topic ON KB_match.topicID = topic.id
					JOIN keyboard ON KB_match.kbID = keyboard.id
					WHERE KB_match.kbID = $target`;

		db.all(query, { $target: target }, function(err, topics) {
			if (err) {
				new utils.QueryError("fillCategory", { $target: target }, err);
			}

			topics.forEach(function(topic) {
				const body = {
					text: topic.formatted,
					callback_data: JSON.stringify({src:"subs", cmd: "topic", content: topic.id.toString()}),
				};

				/*
				 * A topic name cannot be longer than about 19 chars to get two 19-chars-long buttons in a keyboard.
				 * Or may be the first case
				 * Or the last row has already 2 buttons.
				 */
				if (!keyboards[name].length || topic.name.length >= 19 || keyboards[name].rowLength(-1) === 2) {
					keyboards[name].addRow(body);
				} else {
					keyboards[name].push(-1, body);
				}
			});

			// standard buttons
			keyboards[name].addRow({
				text: "All subcategories",
				callback_data: JSON.stringify({src: "subs", cmd:"topic", content: target+":all"})
			}, {
				text: "Custom ✏️",
				callback_data: JSON.stringify({src: "subs", cmd: "action", content: `custom:${target}`})
			})
			.addRow({
				text: "◀ Back to the main page",
				callback_data: JSON.stringify({src: "subs", cmd: "nav", content: "back"})
			});
		});
	};
});

/**
 * Silly function to avoid not authorised users use functions
 *
 * @function forbidden
 * @param {String|Integer} uid - user id
 */

function forbidden(uid) {
	bot.sendMessage(uid, `Sorry but this feature is intended for @techbinder or affiliated channels followers only.`);
}

/**
 * Compiles the structure for the first message.
 *
 * @function prepareFirst
 * @params {String|Integer} uid - user id
 * @returns {Object} - formatted object for utils.send
 */

function prepareFirst(uid) {
	if (!uid) {
		throw "prepareFirst: missing uid";
	}

	return {
		target: uid,
		content: `
Use the buttons below to explore the categories or use "Custom ✏️" to write your own.
Use "My Subscriptions" to list them all.
☑️ = subscribed | ✏️ = Manual insertion`,
		options: keyboards["first"].summon(),
	};
}

/**
 * Defines a map of not allowed characters for a topic name and replace them
 *
 * @function mapNotAllowed
 * @param {String} string - topic name
 * @returns {String} - parsed string
 */

function mapNotAllowed(string) {
	const notAllowed = new Map([
		["+", "p"],
		["#", "sharp"],
		[".", "dot"],
		["/", "slash"],
		["[", ""], ["]", ""],
		["{", ""], ["}", ""],
		[":", ""], [";", ""],
		["*", ""], ["^", ""],
		["=", ""], [" ", ""],
	]);

	notAllowed.forEach(function(replacer, key) {
		key = key.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
		const keyRex = new RegExp(key, "ig");
		string = string.replace(keyRex, replacer);
	});

	return string;
}

/**
 * Creates a custom keyboard based on a template and on user-subscribed categories
 *
 * @function customKeyboard
 * @param {String} model - keyboard model to be used
 * @param {String|Integer} user - user id
 * @returns {Promise} - Promise with the new keyboard as argument
 */

function customKB(model, user) {
	return new Promise(keyboard => {
		/** Selecting topics to which a user is subscribed to and which belongs to the requested keyboard. **/
		let query = `SELECT KB_match.topicID as "id", topic.name from KB_match
					JOIN topic ON KB_match.topicID = topic.id
					JOIN keyboard ON KB_match.kbID = keyboard.id
					JOIN subscription ON topic.id = subscription.topicID
					WHERE subscription.user_id = $user AND keyboard.name_id = $lk;`;

		db.all(query, {$user: user, $lk: users[user].lastKeyboard}, function(err, subscriptions) {
			if (err) {
				new utils.QueryError("customKB", {
					$user: user,
					$lk: users[user].lastKeyboard,
				}, err);
			}

			if (!subscriptions.length) {
				return keyboard(keyboards[model].extract("content"));
			}

			const template = JSON.parse(JSON.stringify(keyboards[model].extract("content")));

			template.forEach(function(line, rowIndex) { // each set of buttons
				line.forEach(function(btn, btnIndex) { // each button of a set
					const btnData = JSON.parse(btn.callback_data);
					const content = btnData.content; // topic.id in database

					if (btnData.cmd === "topic" && !isNaN(content)) {
						subscriptions.some(function(match, subIndex) {
							if (Number(content) === match.id) {
								template[rowIndex][btnIndex].text += " ☑️";
								subscriptions.splice(subIndex, 1);
								return true;
							}
						});						
					}
				});
			});
			return keyboard(template);
		});
	});
}

/**
 * Compiles subscriptionsKB following the button-length rule. 
 *
 * @function createRows
 * @params {Array} topics - array of objects in telegram format
 */

function createRows(topics) {
	let kb = [];

	Object.keys(topics).forEach(function(limit, keyIndex) {
		// (13 % 5) - 0 = 3 // (18 % 5) - 1 = 2 // (43 % 5) - 2 = 1
		let indexRev = (Number(limit) % 5) - keyIndex;
		topics[limit].forEach(function(topic, tIndex) {
			// If the rest is equal to 0, a new line must be created
			if (!kb.length || !(tIndex % indexRev)) {
				kb.push([topic]);
			} else {
				kb[kb.length-1].push(topic);
			}
		});
	});

	return kb;
}

/**
 * Generates user's subscription inline keyboard
 *
 * @function subscriptionsKB
 * @param {String|Integer} uid - user id
 * @returns {Promise} - Promise containing InlineKeyboardMarkup object
 * @see https://core.telegram.org/bots/api#inlinekeyboardmarkup
 */

function subscriptionsKB(uid) {
	return new Promise(keyboard => {
		let query = `SELECT topic.* FROM subscription
					JOIN topic on subscription.topicID = topic.id
					WHERE subscription.user_id = $user
					ORDER BY LENGTH(IFNULL(topic.formatted, topic.name));`;

		db.all(query, {$user: uid}, function(err, get) {
			if (err) {
				new utils.QueryError("subscriptionsKB", {
					"$user": uid,
				}, err);
			}

			let subs = [];
			if (get && get.length) {
				/* 
				 * These "steps" were chosen as about the max length that a
				 * Telegram button can contain without make "..." appear.
				 * (13 * 3 btns, 18 * 2 btns, 43 * 1 btns) PER ROW
				 */
				const organized = {
					"13": [],
					"18": [],
					"43": [],
				};

				get.forEach(function(topic, index) {
					const nameOrFormatted = get[index].formatted ? "formatted" : "name";
					const struct = {
						text: get[index][nameOrFormatted],
						callback_data: JSON.stringify({src: "subs", cmd: "topic", content: get[index].id.toString()+":mysubs"}),
					};

					if (get[index][nameOrFormatted].length <= 13) {
						organized["13"].push(struct);
					} else if (get[index][nameOrFormatted].length <= 18) {
						organized["18"].push(struct);
					} else {
						organized["43"].push(struct);
					}

					
				});

				subs = createRows(organized);
				subs.push([{
					text: "❌ Unsubscribe from all categories",
					callback_data: JSON.stringify({src: "subs", cmd: "action", content: "unsub-*"}),
				}]);
			}

			subs.push([{
				text: "◀ Back to the main page",
				callback_data: JSON.stringify({src: "subs", cmd: "nav", content: "back"}),
			}]);

			return keyboard(subs);
		});
	});
}

ƒ.subs = {
	nav: function(q) {
		/**
		 * Manages the inline-keyboard actions for navigation keys.
		 *
		 * @function nav
		 * @memberof ƒ.subs
		 * @params {Object} q - Telegram's a-bit-parsed CallbackQuery object
		 * @see https://core.telegram.org/bots/api#callbackquery
		 */

		const content = q.data.content; // keyboard.name_id in db
		const uid = q.from.id;
		if (!users[uid]) {
			users[uid] = new User(uid);
		}
		if (typeof content === "string") {
			if (content === "back") {
				users[uid].lastKeyboard = "first";
				utils.editMessage({
					text: prepareFirst(uid).content,
					message_id: q.message.message_id,
					chat_id: uid,
					keyboard: keyboards["first"].extract("content"),
				});
			} else {
				users[uid].lastKeyboard = content;
				const prm = (content === "mysubs" ? subscriptionsKB(uid) : customKB(content, uid));
				prm.then(function(keyboard) {
					if (content === "mysubs") {
						utils.editMessage({
							text: `
Here are all the topics you are subscribed to.
Click on one of them to unsubscribe.`,
							message_id: q.message.message_id,
							chat_id: uid,
							keyboard: keyboard,
						});
					} else {
						utils.editMessage({
							text: `
Select the topic you are interested in.
Please, wait for the check symbol next to the button before trying to subscribe to another topic.
Use Custom ✏️ to insert your own topics`,
							message_id: q.message.message_id,
							chat_id: uid,
							keyboard: keyboard,
						});
					}
				});
			}
		}
	},

	topic: function(q) {
		/**
		 * Manages the inline-keyboard actions for topic keys.
		 *
		 * @function topic
		 * @memberof ƒ.subs
		 * @params {Object} q - Telegram's a-bit-parsed CallbackQuery object
		 * @see https://core.telegram.org/bots/api#callbackquery
		 */

		const uid = q.from.id;
		let topic = q.data.content; // topic.id in db
		const postfix = topic.match(/:(mysubs|all)/gi);
		if (postfix) {
			topic = topic.slice(0, topic.indexOf(postfix[0]));
		}

		if (!users[uid]) {
			users[uid] = new User(uid);
			if (postfix && postfix[0] === ":all") {
				users[uid].lastKeyboard = topic+postfix;
			} else if (postfix && postfix[0] === ":mysubs") {
				users[uid].lastKeyboard = "mysubs";
			} else {
				let query = `SELECT keyboard.name_id FROM KB_match
							JOIN topic on KB_match.topicID = topic.id
							JOIN keyboard on KB_match.kbID = keyboard.id
							WHERE KB_match.topicID = $topic;`;

				db.get(query, {$topic: topic}, function(err, get) {
					if (err) {
						new utils.QueryError("f.subs.topi$1", {
							"$topic": topic,
						}, err);
					}

					users[uid].lastKeyboard = get.name_id;
				});
			}
		}

		let query = `SELECT topic.id FROM topic `;

		let args = {};

		if (postfix && postfix[0] === ":all") {
			/** Selecting topic id of the targeted keyboard **/
			query += `JOIN KB_match ON topic.id = KB_match.topicID
						JOIN keyboard ON KB_match.kbID = keyboard.id
						WHERE keyboard.name_id = $lk;`;

			args.$lk = users[uid].lastKeyboard;
		} else {
			/** Selecting topic id of the targeted topic **/
			query += `WHERE topic.id = $topic;`;
			args.$topic = topic;
		}

		db.all(query, args, function(err, get) {
			if (err) {
				new utils.QueryError("f.subs.topic$2", args, err);
			}

			get.forEach((value, index) => get[index] = value.id);

			users[uid].manageSubscription(get)
				.then(function() {
					if (users[uid].lastKeyboard !== "mysubs") {
						customKB(users[uid].lastKeyboard, uid).then(keyboard => {
							utils.editKeyboard(q.message.message_id, uid, keyboard);
						});
					} else {
						subscriptionsKB(uid).then(keyboard => {
							utils.editKeyboard(q.message.message_id, uid, keyboard);
						});
					}
				});
		});
	},

	action: function(q) {
		/**
		 * Manages the inline-keyboard actions for action keys.
		 *
		 * @function action
		 * @memberof ƒ.subs
		 * @params {Object} q - Telegram's a-bit-parsed CallbackQuery object
		 * @see https://core.telegram.org/bots/api#callbackquery
		 */
		const uid = q.from.id;
		let content = q.data.content;

		const postfix = content.match(/:(.+)/i) || [];
		if (postfix.length && postfix[1]) {
			content = content.slice(0, content.indexOf(postfix[1])-1);
		}

		if (!users[uid] ) {
			users[uid] = new User(uid);
			users[uid].lastKeyboard = postfix[1] || "first";
			// usare i postfix anche sui pulsanti custom, per rappresentare la tastiera di provenienza
		}

		if (typeof content === "string") {
			if (content === "custom") {
				utils.send({
					target: uid,
					content: `
Send me a category name which you want to subscribe to.
Use commas (,) to subscribe to multiple categories.
Each category with length _greater than 15 chararacter_ will be discarded.

_Please note you will be_ *unsubscribed* _to already subscribed inserted categories._`,
					options: new InlineKeyboard({
						text: "Cancel",
						callback_data: JSON.stringify({src: "common", cmd: "cancel", content: "Custom sub."})
					}).summon()
				});

				manager.setPendingAction(uid, function(answer) {
					const topics = answer.text.trim().split(/,(?:\s+)?/g); //@string-array
					const topicsID = {};
					async.eachOfSeries(topics, function(topic, index, cb) {
						topics[index] = topic.toLowerCase();
						// only about 15 characters can be contained in the structure to not exceed in 64-bytes-per-button telegram limit
						if (topic.length < 2 || topic.length > 15) {
							// decreasing index to not skip any element
							return cb();
						} else {
							let parsedTopic = utils.removeHash(mapNotAllowed(topics[index]));
							/** Adding the topic to topic list to retrieve the id in the next query **/
							let query = `INSERT OR IGNORE INTO topic (name) VALUES ($topic);`;
							db.run(query, { $topic: parsedTopic }, function(err) {
								if (err) {
									new utils.QueryError("Custom$1", { $topic: parsedTopic }, err);
								}

								let qSelect = `SELECT id FROM topic WHERE name = $topic`;
								db.get(qSelect, { $topic: parsedTopic }, function(err, get) {
									if (!err) {
										topicsID[utils.capitalize(topics[index])] = Number(get.id);
										topics[index] = parsedTopic;
										cb();
									} else {
										cb({ fn: "Custom$2", argv: { $topic: parsedTopic }, err });
									}
								});
							});
						}
					}, function(err) {
						if (err) {
							return new utils.AsyncError(err.fn, err.argv, err.err);
						}

						const struct = {
							target: uid,
							content: null,
							options: {
								reply_markup: {}
							},
						}

						if (Object.keys(topicsID).length) {
							users[uid].manageSubscription(Object.values(topicsID), true)
								.then(function() {
									struct.content = `
Custom subscription for _${Object.keys(topicsID).toString().replace(/,/ig, ", ")}_ done.
Please note that if you were already subscribed to one of those topics, you just got unsubscribed from that.
Thank _you_! 😊`;

									if (users[uid].lastKeyboard !== "first") {
										customKB(users[uid].lastKeyboard, uid).then(keyboard => {
											struct.options.reply_markup.inline_keyboard = keyboard;
											utils.send(struct);
										});
									} else {
										struct.options = keyboards[users[uid].lastKeyboard].summon();
										utils.send(struct);
									}
								});
						} else {
							struct.content = `No valid topics inserted. Action cancelled.`;
							if (users[uid].lastKeyboard !== "first") {
								customKB(users[uid].lastKeyboard, uid).then(keyboard => {
									struct.options.reply_markup.inline_keyboard = keyboard;
									utils.send(struct);
								});
							} else {
								struct.options.reply_markup.inline_keyboard = keyboards[users[uid].lastKeyboard];
								utils.send(struct);
							}
						}
					});
				});
			} else if (content.includes("unsub-*")) {
				const conf = ["I'm sure.", "Nope, let me stay here where I am."];

				const kb = new Keyboard();
				kb.addRow(conf[0], conf[1]);

				utils.send({
					target: uid,
					content: "Are you sure you want to unsubscribe from all categories?",
					options: kb.open(),
				});

				manager.setPendingAction(uid, function(answer) {
					if (answer.text === conf[0]) {
						let queries = [
							`DELETE FROM user WHERE user_id = $user;`,
							`DELETE FROM subscription WHERE user_id = $user;`
						];
						db.run(queries[0], {$user: uid}, function(err) {
							if (err) {
								new utils.QueryError("f.subs.action$1", {
									"$user": uid,
								}, err);
							}
						});
						db.run(queries[1], {$user: uid}, function(err) {
							if (err) {
								new utils.QueryError("f.subs.action$2", {
									"$user": uid,
								}, err);
							}

							utils.send({
								target: uid,
								content: "Done, you are subscribed to no categories now.",
								options: kb.close(),
							}, prepareFirst(uid));
						});
					} else {
						utils.send({
							target: uid,
							content: "Cancelled.",
							options: kb.close(),
						});
					}
				});
			}
		}
	}
};

class User {
	constructor(uid) {
		this.user = uid;
		this.getSubsCount().then(r => this.subsQt = r);
	}

	manageSubscription(categories, skipRegister = false) {
		/**
		 * Manages the subscriptions for passed categories
		 *
		 * @function manageSubscription
		 * @memberof User
		 * @param {Array} categories - Array of strings
		 * @returns {Promise} - empty promise
		 */

		if (!Array.isArray(categories)) { categories = [categories]; }
		return new Promise((complete, interrupt) => {
			async.each(categories, (topic, callback) => {
				this.isSubscribed(topic).then(isSubscribed => {
					if (!isSubscribed) {
						this.registerUser();
						if (!skipRegister) {
							this.registerTopic(topic);
						}
						this.subscribe(topic).then(callback);
					} else {
						this.unsubscribe(topic).then(callback);
					}
				}).catch(function(err){
					new utils.AsyncError("manageSubscription$1", categories, err);
				});
			}, complete);
		});
	}

	isSubscribed(t) {
		return new Promise((answer, error) => {
			let query = `SELECT * FROM subscription WHERE user_id = $user AND topicID = $topic;`;
			db.get(query, { $user: this.user, $topic: t}, function(err, row) {
				if (err) {
					new utils.QueryError("User.isSubscribed", {
						"$user": this.user,
						"$topic": t,
					}, err);
					return error("Query error.");
				}
				return answer(!!row);
			});
		});
	}

	subscribe(t) {
		return new Promise(success => {
			utils.isChannelMember("~", this.user).then(isChannelMember => {
				if (isChannelMember) {
					let query = `INSERT OR IGNORE INTO subscription VALUES ($user, $topic);`;

					db.run(query, {$user: this.user.toString(), $topic: t}, (err) => {
						if (err) {
							new utils.QueryError("subscribe/3", {
								"$user": this.user.toString(),
								"$topic": t,
							}, err);
						}
						// only the last query must resolve the Promise
						this.subsQt++;
						utils.log(`${this.user} subscribed to ${t}.\n`);
						return success();
					});
				} else {
					return forbidden();
				}
			});
		});
	}

	unsubscribe(t) {
		return new Promise(success => {
			utils.isChannelMember("~", this.user).then(isChannelMember => {
				if (isChannelMember) {
					let queries = [
						"DELETE FROM user WHERE user_id = $user;",
						"DELETE FROM subscription WHERE user_id = $user AND topicID = $topic;"
					];

					db.run(queries[1], {$user: this.user, $topic: t}, (err) => {
						if (err) {
							new utils.QueryError("unsubscribe/1", {
								"$user": this.user.toString(),
								"$topic": t,
							}, err);
						}
					});
					if (!(--this.subsQt)) {
						db.run(queries[0], {$user: this.user}, (err) => {
							if (err) {
								new utils.QueryError("unsubscribe/2", {
									"$user": this.user.toString(),
								}, err);
							}
						});
					}

					utils.log(`${this.user} unsubscribed to ${t}.\n`);
					return success();
				}
			});
		});
	}

	registerUser() {
		let query = `INSERT OR IGNORE INTO user VALUES ($user, date('now'));`;

		db.run(query, {$user: this.user.toString()}, function(err) {
			if (err) {
				new utils.QueryError("subscribe/1", {
					"$user": this.user.toString(),
				}, err);
			}
		});

	}

	registerTopic(topicID) {
		let query = `INSERT OR IGNORE INTO topic (name) VALUES ($topic);`;

		db.run(query, {$topic: topicID}, function(err) {
			if (err) {
				new utils.QueryError("subscribe/2", {
					"$topic": t,
				}, err);
			}
		});
	}

	getSubsCount() {
		return new Promise(count => {
			let query = "SELECT COUNT(*) AS user_subs_qt FROM subscription WHERE user_id = $user";

			db.get(query, { $user: this.user }, (err, qts) => {
				if (err) {
					new utils.QueryError("getSubsCount", {
						"$user": this.user,
					}, err);
				}
				return count(qts.user_subs_qt);
			});
		});
	}

	getSubsList() {
		return new Promise((list, nothing) => {
			let query = "SELECT topicID FROM subscription WHERE user_id = $user";
			db.all(query, { $user: this.user }, function(err, results) {
				if (err) {
					new utils.QueryError("getSubsList", {
						"$user": this.user,
					}, err);
					return nothing([]);
				}

				results.forEach((topic, index) => results[index] = topic.topic_name );
				return list(results);
			});
		});
	}

	// queue
	addToQueue(message_id, channel_id) {
		let query = `INSERT OR IGNORE INTO queue VALUES ($user, $message, $channel);`;
		const transmit = {
			$user: this.user,
			$message: message_id,
			$channel: channel_id,
		};

		db.run(query, transmit, function(err) {
			if (err) {
				new utils.QueryError("addToQueue", transmit, err);
			}
		});
		return this;
	}

	removeFromQueue(message_id, channel_id) {
		let query = `DELETE FROM queue WHERE user_id = $user AND message_id = $message AND channel_id = $channel;`;

		const transmit = {
			$user: this.user,
			$message: message_id,
			$channel: channel_id,
		};

		db.run(query, transmit, function(err) {
			if (err) {
				new utils.QueryError("removeFromQueue", transmit, err);
			}
		});
		return this;
	}

	getQueueLength() {
		return new Promise((solve, reject) => {
			let query = `SELECT COUNT(*) as "length" FROM queue WHERE user_id = $user;`;

			db.get(query, { $user: this.user }, function(err, get) {
				if (err) {
					new utils.QueryError("getQueueLength", {
						"$user": this.user,
					}, err);
				}
				return solve(get.length);
			});
		});
	}

	getQueue(quantity) {
		return new Promise((solve, reject) => {
			let query = `SELECT * FROM queue WHERE user_id = $user`;

			if (quantity && quantity > 0) {
				query += ` LIMIT ${quantity};`
			}

			db.all(query, {$user: this.user}, function(err, queue) {
				if (err) {
					new utils.QueryError("getQueue", {
						"$user": this.user,
					}, err);
				}
				return solve(queue);
			});
		});
	}

	forceUnsubscribeAll() {
		let queries = [
			`DELETE FROM queue WHERE user_id = $user;`,
			`DELETE FROM subscription WHERE user_id = $user;`,
			`DELETE FROM user WHERE user_id = $user;`
		];

		queries.forEach((query, index) => {
			db.run(query, {$user: this.user}, function(err) {
				if (err) {
					new utils.QueryError("forceUnsubscribeAll/"+(index+1), {
						"$user": this.user,
					}, err);
				}
			});
		});
	}

	set lastKeyboard(template) { this.keyboard = template; }
	get lastKeyboard() { return this.keyboard; }
}


// bot extensions
bot.onText(/\/subscribe/, function(msg, match) {
	const uid = msg.from.id;

	utils.isChannelMember("~", uid)
		.then(function(isChannelMember) {
			if (isChannelMember) {
				if (!users[uid]) {
					users[uid] = new User(uid);
					users[uid].lastKeyboard = "first";
				}

				let first = prepareFirst(uid);
				first.content = `Hi, ${msg.from.username}.${first.content}`;

				utils.send(first);
			} else {
				return forbidden(uid);
			}
		});
});

bot.onText(/\/start/, function(msg) {
	const uid = msg.from.id;

	if (!users[uid]) {
		users[uid] = new User(uid);
		users[uid].lastKeyboard = "first";
	}

	users[uid].getQueue().then(function(list) {
		if (list && list.length) {
			const message = `You have pending posts. To unsubscribe, use /subscribe and then click on "My Subscriptions".`;
			bot.sendMessage(uid, message).then(function(){
				async.each(list, (element, callback) => {
					bot.forwardMessage(uid, element.channel_id, element.message_id)
						.then(function(){
							users[uid].removeFromQueue(element.message_id, element.channel_id);

							return callback();
						}, callback);
				}, function(err) {
					if (err) {
						return new utils.AsyncError("/start > async", {
							"element": element,
							"list": list,
						}, err);
					}
				});
			});
		}
	});
});

bot.onText(/\/stats/, function(msg) {
	const uid = msg.from.id;

	if (utils.isAdmin(uid)) {
		let query = `SELECT topic.name, topic.formatted, COUNT(subscription.topicID) as 'quantity' FROM subscription
					JOIN topic ON subscription.topicID = topic.id
					GROUP BY topic.id ORDER BY LENGTH(IFNULL(topic.formatted, topic.name));`;

		db.all(query, function(err, result) {
			if (err) {
				new utils.QueryError("/stats > query", {}, err);
			}

			let message;

			if (result.length) {
				const longer = result[result.length-1][result[result.length-1].formatted ? "formatted" : "name"].length;
				let totalqt = 0;
				message = `Here the statistics:\n*NAME*\`${" ".repeat(longer-4)}| \`*QT*\n\`${"–".repeat(longer+8)}\`\n`;
				result.forEach(function(tuple) {
					const nameOrFormatted = tuple.formatted ? tuple.formatted : tuple.name;
					const cat = nameOrFormatted + "\t".repeat(longer - nameOrFormatted.length + 1);
					message += `\`${cat} | ${tuple.quantity}\n\``;
					totalqt += Number(tuple.quantity);
				});

				message += `\n\nTotal: ${result.length} categories subscribed;\nTotal subscriptions: ${totalqt}.`

			} else {
				message = "No subscribed users at the moment."; 
			}

			bot.sendMessage(uid, message, { parse_mode: "Markdown" });
		});
	}
});

bot.onText(/\/setFormatted\s+([\w\d\S]+)\s+([\w\d\S]+)/, function(msg, match) {
	if (!utils.isAdmin(msg.from.id)) return;
	if (!Boolean(match[1]) || !Boolean(match[2])) {
		bot.sendMessage(msg.from.id, "Wrong usage of `setFormatted` function.\nUsage:\n\n/setFormatted name(id|String) formatted(String)")
	}

	let query = "UPDATE topic SET formatted = $formatted WHERE ";
	if (Number(match[1])) {
		query += "id = $match";
	} else {
		query += "name = $match"
	}

	db.run(query, { $formatted: match[2], $match: match[1] }, function(err) {
		if (err) {
			bot.sendMessage(msg.from.id, `Error on execution. Error: ${err}`);
		} else {
			bot.sendMessage(msg.from.id, `${match[1]} formatted name got set/updated successfully to _${match[2]}_.`);
		}
	});
});

bot.on("channel_post", function(msg) {
	if (msg["forward_from_chat"] && utils.isAffiliated(Number(msg["forward_from_chat"].id))) {
		return;
	}

	const post = utils.extractTags(msg.text, msg.entities || []);

	if (msg.entities && post.hasHashtags) {
		const topics = post.tags;

		/** Selecting all users subscribed to the topics in the posts **/
		// repeating a piece of query to avoid multiple posts to a user, one for tag.
		const query =  `SELECT DISTINCT user.user_id AS "id" FROM user
						JOIN subscription ON user.user_id = subscription.user_id
						JOIN topic ON subscription.topicID = topic.id
						WHERE topic.name = ? ${"OR topic.name = ? ".repeat(topics.length > 1 ? topics.length-1 : 0)};`;

		db.all(query, topics, function(err, userList) {
			if (err) {
				new utils.QueryError("channel_post > query $1", {
					topics: topics,
				}, err);
			}

			async.each(userList, function(user, callback) {
				utils.isChannelMember(msg.chat.username || msg.chat.id, user.id).then(isChannelMember => {
					if (isChannelMember) {
						if (!users[user.id]) {
							users[user.id] = new User(user.id);
							users[user.id].lastKeyboard = "first";
						}

						bot.forwardMessage(user.id, msg.chat.id, msg.message_id)
							.then(function() {
								/**
								 * Then callback for success on message forwarding
								 * @function <anonymous>
								 */
								users[user.id].getQueue().then((queuePosts) => {
									async.each(queuePosts, (qpost, nextPost) => {
										bot.forwardMessage(user.id, qpost.channel_id, qpost.message_id)
											.then(function() {
												users[user.id].removeFromQueue(qpost.message_id, qpost.channel_id);
												return nextPost();
											})
											.catch(function() {
												users[user.id].removeFromQueue(qpost.message_id, qpost.channel_id);
												return nextPost();
											});
									}, function(err) {
										if (err) {
											new utils.AsyncError("channel_post > async$2", qpost, err);
										}
									});
								});

								return callback();
							})
							.catch(function(e) {
								/**
								 * Catch callback for error on message forwarding
								 * a failed to be sent message, get added to the queue for the user.
								 * @function <anonymous>
								 */
								users[user.id]
									.addToQueue(msg.message_id, msg.chat.id)
									.getQueueLength().then(function(queue) {
										if (queue > 10) {
											users[user.id].forceUnsubscribeAll();
										}
									});

								return callback();
							});
					}
				});
			}, function(err) {
				if (err) {
					new utils.QueryError("channel_post > async$1", { userList }, err);
				}
			});
		});
	}
});

module.exports = {
	commands: {
		public: [{
			command: "/subscribe",
			description: "Summons subscription system keyboard",
		}],
		private: [{
			command: "/stats",
			description: "Subscriptions statistics",
		}, {
			command: "/setFormatted",
			args: "<name|id> <formatted>",
			description: "Adds a formatted name to show as a topic name."
		}],
	},
};
