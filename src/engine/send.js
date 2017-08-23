const moment = require("moment");
const manager = require("../manager.js");
const utils = require("../utils.js");
const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

const comodules = [];
const bot = utils.bot;
const InlineKeyboard = utils.InlineKeyboard;
const Keyboard = utils.Keyboard;
const ƒ = manager.ƒ;

const keys = Object.create(null, {
	"showOptions": {
		value: Object.freeze({
			text: "Options",
			callback_data: JSON.stringify({src: "send", cmd: "showOptions"}),
		}),
		configurable: false,
		writable: false,
	},
	"setInteresting": {
		value: Object.freeze({
			text: "⭐️ Set as Interesting",
			callback_data: JSON.stringify({src: "send", cmd: "setInteresting"}),
		}),
		configurable: false,
		writable: false,
	},
	"setNotInteresting": {
		value: Object.freeze({
			text: "⭐️ This is an interesting post (undo) ⭐️",
			callback_data: JSON.stringify({src: "send", cmd: "setNotInteresting"}),
		}),
		configurable: false,
		writable: false,
	},
	"publish": {
		value: Object.freeze({
			text: "⚠️ Publish Now",
			callback_data: JSON.stringify({src: "send", cmd: "publish"}),
		}),
		configurable: false,
		writable: false,
	},
	"getBack": {
		value: Object.freeze({
			text: "◀️ Go back",
			callback_data: JSON.stringify({src: "send", cmd: "getBack"}),
		}),
		configurable: false,
		writable: false,
	}
});

function copyEditKey(name, content) {
	if (name in keys) {
		// dereferencing old object to not edit the original one
		let copy = JSON.parse(JSON.stringify(keys[name]));
		copy.callback_data = JSON.parse(copy.callback_data);
		copy.callback_data.content = content;
		copy.callback_data = JSON.stringify(copy.callback_data);

		return copy;
	}

	throw `copyEditKey :: "${name}" is not a valid key.`;
}

/**
 * Given a message_id and its content, this will fetch datas or from db or from the content itself
 *
 * @function fetchMessage
 * @param {string} source - where the function should check first
 * @param {Object} data - data needed for both inner functions (db and content)
 * @param {string|number} data.message_id - message to be fetched id
 * @param {string} data.message - post content
 * @returns {Promise} - Promise containing an Object
 */

function fetchMessage(source = "db", data = {}) {
	let fetch = {
		"db": function(message_id) {
			return new Promise(function(s, r) {
				let query = `SELECT suggested.*, GROUP_CONCAT('#' || topic.name, " ") as "tags" FROM suggested
							 JOIN argmatch on suggested.message_id = argmatch.message_id
							 JOIN topic on argmatch.topic_id = topic.id
							 WHERE suggested.message_id = $mid;`;

				db.get(query, { $mid: message_id }, function(err, get) {
					/**
					 * Returns the result from database query execution
					 * @function <anonymous>
					 * @param {string=} err - error
					 * @param {Object} get - array of results from db
					 */
					if (err) {
						new utils.QueryError("fetchMessage$2", { $mid: message_id }, err);
						return r(false);
					}

					if (!get || !get.message_id || !get.link || !get.tags) {
						return s({});
					}

					return s(Object.assign(get, {
						firstTimePosted: moment().utc().add(1, "h").format("YYYY-M-D"),
					}));
				});
			});
		},

		"content": function(text) {
			const message = text
					.split("\n")
					.filter(el => /\S/.test(el));

			return {
				link: message[1],
				text: message.length > 3 && !message[2].includes("Tags:") ? message[2] : "",
				tags: (() => {
					let tgs = message[message.length > 3 && message[3].includes("Tags:") ? 3 : 2];
					if (tgs.includes("Tags:")) { tgs = tgs.substr(6); }
					return tgs;
				})(),
				referencer: (() => {
					let id = Number(message[0].match(/[0-9]+/ig)[0]);
					return utils.isAdmin(id) ? null : id;
				})(),
			};
		}
	};

	return new Promise(function(success, reject) {
		if (!data) {
			throw "getMessage :: Missing data.";
		}

		if (source === "db" || source === "database") {
			if (!data.message_id) {
				new utils.ArgsError("fetchMessage$0", { data }, "Missing message_id");
			}

			fetch.db(data.message_id).then(function(result) {
				success(result && Object.keys(result).length ? result : fetch.content(data.message));
			});

		} else if (source === "content") {
			if (!data.message) {
				new utils.ArgsError("fetchMessage$1", { data }, "Missing content");
			}

			success(fetch.content(data.message));
		} else {
			throw `getMessage :: chosen source ["${source}"] is not a valid source.`;
		}

	});
}

/**
 * Creates a message to be published into the channel in a precise template
 *
 * @function msgFetcher
 * @param {string} message - message to be organized
 * @return {Promise.<string, Error>}
 */

function msgFetcher(message, message_id, source = "db") {
	return new Promise(function(s, r){
		fetchMessage(source, { message_id, message }).then(function(post) {
			return s(msgPackager(post));
		});
	});
}

/**
 * Composes a techbinder message structure
 *
 * @function msgPackager
 * @param {Object} data - message data
 * @return {Promise};
 */

function msgPackager(data) {
	return new Promise(function(s,r) {
		let organized = `
${data["link"]}
${data["text"] || data["message"] ? "\n"+(data["text"] || data["message"]) : ""}
${data["text"] || data["message"] ? "\n" : ""}Tags: ${data["tags"] || data["topics"]}`;

		if (data.referencer) {
			return bot.getChat(data.referencer).then(function(user) {
				organized += `\nSent us by @${user.username}`;
				return s(organized);
			}).catch(function(e){ return r(e) });
		} else {
			return s(organized);
		}
	});
}

/**
 * Adds a post to the suggestions database
 *
 * @function addSuggestion
 * @param {Object} data - contents to be added to the db
 * @param {string|number} data.$message_id - id of the post
 * @param {string} data.$link - resource to be added
 * @param {string=} data.$message - post message
 * @param {string} data.$tags - post tags
 * @param {string} data.$referencer - the user which sent the suggestion
 */

function addSuggestion(data = {}) {
	if (!data["$message_id"]) {
		throw "addSuggestion :: Missing $message_id";
	} else if (!data["$link"]) {
		throw "addSuggestion :: Missing $link";
	} else if (!data["$tags"]) {
		throw "addSuggestion :: Missing $tags";
	}

	data["$message"] = data["$message"] || "";

	let tags = data["$tags"];
	delete data["$tags"];

	if (typeof tags === "string") {
		tags = tags.substring(tags.includes("Tags:") ? 5 : 0).split(/\s+/);
	}

	tags = tags.filter(e => /\S/.test(e));
	tags.forEach((tag, ind, arr) => arr[ind] = utils.removeHash(tag).toLowerCase().trim());

	let queries = [
		`INSERT OR REPLACE INTO suggested::fields VALUES::ph`,
		`INSERT OR IGNORE INTO topic (name) VALUES ${"(?), ".repeat(tags.length-1)}(?);`,
		`INSERT OR IGNORE INTO argmatch SELECT ?, id FROM topic WHERE name = ?;`,
		`INSERT OR IGNORE INTO timematch VALUES ($link, 0, date('now'), date('now'));`,
	];

	let fields = {
		set1: ["$message_id", "$link", "$message"],
		set0: ["message_id", "link", "message"],
	};

	if (!data["$referencer"]) {
		delete data["$referencer"]; // it may be null
	} else {
		fields["set0"] = [];
		fields["set1"].push("$referencer");
	}

	queries[0] = queries[0].replace("::ph", `(${fields["set1"].join(", ")})`)
							.replace("::fields", fields["set0"] ? `(${fields["set0"].join(", ")})` : "");

	db.run(queries[0], data, function(err) {
		if (err) {
			new utils.QueryError("addSuggestion$1", data, err);
		}
	});

	db.run(queries[1], tags, function(err) {
		if (err) {
			new utils.QueryError("addSuggestion$2", tags, err);
		}

		tags.forEach(function(t) {
			db.run(queries[2], [data["$message_id"], t], function(err) {
				if (err) {
					new utils.QueryError("addSuggestion$3", [data["$message_id"], t], err);
				}
			});
		});
	});

	db.run(queries[3], { $link: data["$link"] }, function(err) {
		if (err) {
			new utils.QueryError("addSuggestion$4", { $link: data["$link"] }, err);
		}
	});
}

ƒ.send = {
	// staff reserved functions

	/**
	 * Shows options for a post in telegram inline buttons form
	 *
	 * @function showOptions
	 * @memberof ƒ.send
	 * @param {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	showOptions: function(q) {
		fetchMessage("db", { message_id: q.message.message_id, message: q.message.text }).then(function(post) {
			let query = `SELECT s.* FROM suggested as "s"
						JOIN interesting_posts as "ip" ON s.link = ip.link
						WHERE s.message_id = $mid`;

			db.get(query, { $mid: q.message.message_id }, function(err, result) {
				/**
				 * Returns the result from database query execution
				 * @function <anonymous>
				 * @param {string=} err - error
				 * @param {Object} result - array of results from db
				 */

				if (err) {
					new utils.QueryError("f.subs.showOptions", { $mid: q.message.message_id }, err);
				}

				let kb = new InlineKeyboard();
				kb.addRow(keys[!result ? "setInteresting" : "setNotInteresting"])
				  .addRow(keys["publish"])
				  .addRow(keys["getBack"]);

				utils.editKeyboard(
					q.message.message_id,
					q.message.chat.id,
					kb.extract("content")
				);
			});
		});
	},

	/**
	 * Adds a message to the database of interesting posts
	 *
	 * @function setInteresting
	 * @memberof ƒ.send
	 * @param {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	setInteresting: function(q) {
		let query = `INSERT OR IGNORE INTO interesting_posts
						SELECT link FROM suggested as "s"
						WHERE s.message_id = $mid;`;

		db.run(query, { $mid: Number(q.data.content) || q.message.message_id }, function(err) {
			if (err) {
				new utils.QueryError("f.subs.setInteresting", { $mid: Number(q.data.content) || q.message.message_id }, err);
			}
		});

		let kb = new InlineKeyboard();

		if (q.data.content) {
			kb.addRow(copyEditKey("setNotInteresting", q.data.content))
			  .addRow(copyEditKey("publish", q.data.content));
		} else {
			kb.addRow(keys["setNotInteresting"])
			  .addRow(keys["publish"])
			  .addRow(keys["getBack"]);
		}

		utils.editKeyboard(
			q.message.message_id,
			q.message.chat.id,
			kb.extract("content")
		);
	},

	/**
	 * Removes a message from the database of interesting posts
	 *
	 * @function setNotInteresting
	 * @memberof ƒ.send
	 * @param {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	setNotInteresting: function(q) {
		let query = `DELETE FROM interesting_posts WHERE link IN (SELECT link FROM suggested WHERE message_id = $mid);`;

		db.run(query, { $mid: Number(q.data.content) || q.message.message_id }, function(err) {
			if (err) {
				new utils.QueryError("f.subs.setNotInteresting", { "$mid": Number(q.data.content) || q.message.message_id }, err);
			}
		});

		let kb = new InlineKeyboard();

		if (q.data.content) {
			kb.addRow(copyEditKey("setInteresting", q.data.content))
			  .addRow(copyEditKey("publish", q.data.content));
		} else {
			kb.addRow(keys["setInteresting"])
			  .addRow(keys["publish"])
			  .addRow(keys["getBack"]);
		}

		utils.editKeyboard( q.message.message_id, q.message.chat.id, kb.extract("content"));
	},

	/**
	 * Puts back the telegram inline keyboard to the original status showing "Show Options"
	 *
	 * @function getBack
	 * @memberof ƒ.send
	 * @param {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	getBack: function(q) {
		let kb = new InlineKeyboard(keys["showOptions"]);

		utils.editKeyboard( q.message.message_id, q.message.chat.id, kb.extract("content"));
	},

	/**
	 * Creates a new post in the channel with a private confirm
	 * 
	 * @function publish
	 * @memberof ƒ.send
	 * @param {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	publish: function(q) {
		fetchMessage("db", { message_id: Number(q.data.content) || q.message.message_id, message: q.message.text }).then(function(post) {
			let kb = new Keyboard("Yes, I'm sure 👍", "No, what am I doing? ❌");
			let preview;

			if (!q.data.content) {
				preview = bot.sendMessage(q.from.id, "*Post preview*:", { parse_mode: "Markdown" });
			} else {
				preview = Promise.resolve();
			}

			preview.then(() => {
				msgPackager(post).then(function(compiled) {
					let middle;

					if (!q.data.content) {
						middle = bot.sendMessage(q.from.id, compiled);
					} else {
						middle = Promise.resolve();
					}

					middle.then(() => {
						bot.sendMessage(q.from.id, `Are you sure you want to post this immediately? ${process.argv[2] === "dev" ? "This post will be sent to the test channel." : ""}`, kb.open())
					});

					manager.setPendingAction(q.from.id, function publishConfirm(answer) {
						/**
						 * Publishes the post after a confirm
						 *
						 * @function publishConfirmCB
						 * @param {Object} answer - Telegram Message Object
						 * @see https://core.telegram.org/bots/api#message
						 */

						if (answer.text === kb.getKeys[0]) {
							if (process.argv[2] === "dev") {
								bot.sendMessage(utils.destinations.channel, compiled).then(function(sent) {
									if (comodules.some(m => m === "subscription.js")) {
										bot.emit("channel_post", sent);
									}
								});
							} else {
								bot.sendMessage("@techbinder", compiled).then(function(sent) {
									if (comodules.some(m => m === "subscription.js")) {
										bot.emit("channel_post", sent);	
									}
								});
							}

							bot.sendMessage(q.from.id, "Done.", kb.close());
						} else {
							bot.sendMessage(q.from.id, "Cancelled.", kb.close());
						}
					});
				});
			});
		});
	},

	skip: function(q) {
		const editDetails = {
			chat_id: q.from.id,
			message_id: q.message.message_id,
			parse_mode: "Markdown",
		};

		bot.editMessageText(`Now send me a message to be attached or press skip.\n*Hashtags will be ignored here.* * *\\[ *skipped* \]`, editDetails)
		.then(() => ƒ.common.next(q));
	},
};

/**
 * Leads the user into a step-by-step resources sending
 *
 * @function suggest
 * @param {Object} sender - Telegram user object.
 * @see https://core.telegram.org/bots/api#user
 */

function suggest(sender) {
	let postKB = new InlineKeyboard(keys["showOptions"]);

	const userMessage = {
		target: sender.id,
		content: "The suggestion has been sent and will be analyzed. Thanks for your contribution. 😉",
		getMID: false,
	};

	const staffMessage = {
		target: utils.destinations.channel,
		content: "",
		options: Object.assign({
			parse_mode: null,
		}, postKB.summon()),
		getMID: true,
	};

	const messageData = {
		$message_id: 0,
		$link: null,
		$message: null,
		$tags: null,
		$referencer: null
	};

	let queries = [
		`SELECT id FROM ban_users WHERE id = $user`,
		`SELECT domain FROM ban_sites WHERE domain = $domain;`
	];

	db.get(queries[0], { $user: sender.id }, function(err, usersList) {
		/**
		 * Returns the result from database query execution
		 * @function <anonymous>
		 * @param {string=} err - error
		 * @param {Object} usersList - array of results from db
		 */

		if (err) {
			new utils.QueryError("suggest$1", { "$user": sender.id, }, err);
		}

		if (usersList) {
			userMessage.content = "Sorry, you got banned from the using of this system.";
			return utils.send(userMessage);
		}

		let stepKB = new InlineKeyboard({
			text: "Cancel",
			callback_data: JSON.stringify({src: "common", cmd: "cancel", content: "Sending"})
		});

		bot.sendMessage(sender.id, `Hi @${sender.username}. Send me a valid URI to be shared with @techbinder community. Please, share only English resources. Others will be rejected.\nPress Cancel in any moment to cancel sending action.`, stepKB.summon());

		/**
		 * Takes a url in a object, analizes it and proceed into the request chain
		 *
		 * @function riAnalysis$0
		 * @param {Object} answer - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */

		function uriAnalysis$0(answer) {
			utils.isChannelMember("@techbinder", sender.id).then(function(isChannelMember) {
				if (isChannelMember) {
					if (!answer.entities || !answer.entities.some(entity => entity.type === "url")) {
						userMessage.content = `Sorry, invalid URI. Please, provide a valid one.`;
						userMessage.options = stepKB.summon();

						utils.send(userMessage);
						return manager.setPendingAction(sender.id, uriAnalysis$0).setFirst();
					}

					const hostname = utils.getHostname(answer.text);
					if (!hostname) {
						manager.setPendingAction(sender.id, URIAnalysis).setFirst();
						userMessage.content = "This content is not valid. Please, provide a valid URI.";
						userMessage.options = stepKB.summon();

						utils.send(userMessage);
						// resetting for the next try
						userMessage.content = "The suggestion has been sent and will be analyzed. Thanks for your contribution. 😉",
						userMessage.options = null;
						return manager.fireCallbacks(sender.id, answer);
					}
						
					db.get(queries[1], { $domain: hostname }, function(err, sitesList) {
						/**
						 * Returns the result from database query execution
						 * @function <anonymous>
						 * @param {string=} err - error
						 * @param {Object} siteList - array of results from db
						 */
						if (err) {
							new utils.QueryError("suggest$2", { $domain: hostname, }, err);
						}

						if (sitesList) {
							userMessage.content = "I'm sorry but the resource you linked has been banned and cannot be sent.";
							return utils.send(userMessage);
						}

						stepKB.popRow().addRow({
							text: "Skip",
							callback_data: JSON.stringify({src: "send", cmd: "skip"})
						});

						messageData["$link"] = answer.text;
						staffMessage.content = `@${answer.from.username} (${answer.from.id}) ha suggerito il seguente contenuto:\n${answer.text}`;
						bot.sendMessage(answer.from.id, "Now send me a message to be attached or press skip.\n*Hashtags will be ignored here.*", Object.assign(stepKB.summon(), { parse_mode: "Markdown" }));
					});
				} else {
					bot.sendMessage(msg.from.id, "Sorry, only @techbinder followers can use this function.");
					manager.forcePending(msg.from.id);
				}
			});
		} /** URIAnalysis **/

		/**
		 * Confirms the previous action and takes a message
		 *
		 * @function tagsRequest$1
		 * @param {Object} answer - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */

		function tagsRequest$1(answer) {
			bot.sendMessage(sender.id, "Add now some hashtags to categorize this post.");

			userMessage.content = "The suggestion has been sent and will be analyzed. Thanks for your contribution. 😉";
			userMessage.options = {};			

			if (answer && answer.text) {
				staffMessage.content += "\n";
				if (answer.entities && answer.entities.some((entity) => entity.type === "hashtag")) {

					let noHashtagsMessage = answer.text;
					answer.entities.forEach(function(e) {
						if (e.type === "hashtag") {
							noHashtagsMessage = noHashtagsMessage.replace(answer.text.substring(e.offset, e.offset+e.length), "");
						}
					});

					staffMessage.content += messageData["$message"] = noHashtagsMessage.trim();
				} else {
					staffMessage.content += messageData["$message"] = answer.text;
				}
			}
		}

		/**
		 * Parses the given hashtags and send the compiled message
		 *
		 * @function tagsRetrieve$2
		 * @param {Object} answer - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */

		function tagsRetrieve$2(answer) {
			/**
			 * Bridge to finalize the structure and add the post to the database.
			 *
			 * @function postAdd$21
			 * @param {number[]|string[]} message_id - id of sent messages
			 */

			function postAdd$21(message_id = []) {
				if (message_id.length) {
					messageData["$message_id"] = message_id[0];

					addSuggestion(messageData);
				} else {
					throw "postAdd$21 :: message_id length is zero.";
				}
			}

			let post = utils.extractTags(answer.text, answer.entities || []);

			if (post.hasHashtags) {
				messageData["$tags"] = post.tags;
				staffMessage.content += `\n\nTags: ${post["raw"].join(" ")}`;
			} else {
				manager.setPendingAction(sender.id, [tagsRequest$1, tagsRetrieve$2]);
				bot.sendMessage(sender.id, `No hashtags found. Try again.`);
				answer.text = "";
				return manager.fireCallbacks(sender.id, answer);
			}

			if (!utils.isAdmin(sender.id)) {
				utils.send(staffMessage, userMessage).then(postAdd$21);
				messageData["$referencer"] = sender.id;
			} else {
				delete messageData["$referencer"];
				let query = `SELECT * FROM suggested WHERE link = $link;`;

				db.get(query, { $link: messageData["$link"] }, function(err, get) {
					/**
					 * Returns the result from database query execution
					 * @function <anonymous>
					 * @param {string=} err - error
					 * @param {Object} get - array of results from db
					 */
					if (err) {
						new utils.QueryError("suggest$3", { $message_id: messageData["$message_id"] }, err);
					}

					if (get) {
						// if this is true, the link has already been suggested
						const kb = new Keyboard("Yes", "No");
						bot.sendMessage(sender.id, `This link has been already proposed by ${get.referencer || "one of the admins"}. Do you want to send it anyway?`, kb.open());
						return manager.setPendingAction(sender.id, function sendswitch(answer) {
							userMessage.options = kb.close();

							if (answer.text === kb.getKeys[1]) {
								userMessage.content = "Discarded.";
								utils.send(userMessage);
							} else {
								utils.send(userMessage, staffMessage).then(postAdd$21);
							}
						});
					} else {
						utils.send(userMessage, staffMessage).then(postAdd$21);
					}
				});
			}
		} /** tagsRetrieve **/

		manager.setPendingAction(sender.id, [uriAnalysis$0, tagsRequest$1, tagsRetrieve$2]);
	});
}

// bot extensions
bot.onText(/\/send(\s.+)?/, function(msg, match) {
	if (/(super)?group/.test(msg.chat.type)) return;

	utils.isChannelMember("@techbinder", msg.chat.id).then(function(isChannelMember) {
		if (isChannelMember) {
			return suggest(msg.from);
		} else {
			bot.sendMessage(msg.from.id, "Sorry, only @techbinder followers can use this function.");
		}
	});
});

bot.onText(/\/list(?:\s+)?([#\w\d\s]+)+/i, function(msg, match) {
	if (!utils.isAdmin(msg.from.id)) { return; }

	let selection = match[1].toLowerCase()
					.split(/\s+/g)
					.filter(el => el.charAt(0) === "#"); // removing non-hashtags from the array
	selection.forEach((ch, i, ara) => ara[i] = utils.removeHash(ch)); // removing hashes

	if (selection.length > 0) {
		let query = `SELECT s.message_id, s.link, s.message FROM suggested as "s"
					JOIN interesting_posts as "ip" ON s.link = ip.link
					JOIN argmatch ON s.message_id = argmatch.message_id
					JOIN topic ON argmatch.topic_id = topic.id
					WHERE topic.name = ?`+(" OR topic.name = ?").repeat(selection.length-1)+` GROUP BY s.message_id;`;

		db.all(query, selection, function(err, get) {
			/**
			 * Returns the result from database query execution
			 * @function <anonymous>
			 * @param {string=} err - error
			 * @param {Object[]} get - array of results from db
			 */

			if (err) {
				new utils.QueryError("/list", selection, err);
			}

			let message = `Here are the favorite posts matching your tag search:\n_${selection.toString().replace(/,/g, " | ")}_`;

			if (get && get.length) {
				get.forEach(function(r) {
					// escaping a markdown character requires first opening and closing the ch and then double escape it self. For _ => __\\_
					message += `\n/evoke__\\_${r.message_id} - [${r.link.substring(0, 45)+(r.link.length > 45 ? "..." : "")}](${r.link}) ${r.message.substring(0, 15) || ""}`;
				});
			} else {
				message = "Nothing found for the provided arguments.";
			}

			bot.sendMessage(msg.from.id, `${message}`, { parse_mode: "Markdown", disable_web_page_preview: true });
		});
	} else {
		bot.sendMessage(msg.from.id, `No valid hashtags inserted.`);
	}
});

bot.onText(/\/evoke_([0-9]+)/, function(msg, match) {
	if (!utils.isAdmin(msg.from.id)) { return; }

	let query = `SELECT s.*, GROUP_CONCAT('#' || topic.name, " ") as "topics",
					timematch.times, timematch.first_time, timematch.last_time
				 FROM suggested as "s"
				 JOIN interesting_posts as "ip" ON s.link = ip.link
				 JOIN timematch ON s.link = timematch.link
				 JOIN argmatch ON s.message_id = argmatch.message_id
				 JOIN topic ON argmatch.topic_id = topic.id
				 WHERE s.message_id = $mid;`

	db.get(query, { $mid: match[1] }, function(err, get) {
		/**
		 * Returns the result from database query execution
		 * @function <anonymous>
		 * @param {string=} err - error
		 * @param {Object} get - array of results from db
		 */
		if (err) {
			new utils.QueryError("evoke$0", { $mid: match[1] }, err);
		}

		let headerMessage = `No posts found for id ${match[1]} among interesting posts.`;

		if (get) {
			headerMessage = `This post has been sent *${get.times} time`;

			if (get.times > 1) {
				headerMessage += `s*, first of which on *${get.first_time}* and last time on *${get.last_time}*.`
			} else {
				headerMessage += `* on *${get.first_time}*.`;
			}

			const btnEdits = {
				"publish": copyEditKey("publish", get.message_id),
				"setNotInteresting": copyEditKey("setNotInteresting", get.message_id)
			};

			const kb = new InlineKeyboard();
				  kb.addRow(btnEdits['setNotInteresting'])
					.addRow(btnEdits['publish']);

			bot.sendMessage(msg.from.id, headerMessage, { parse_mode: "Markdown" }).then(function() {
				msgPackager(get)
					.then(packagedMsg => bot.sendMessage(msg.from.id, packagedMsg, Object.assign({
							parse_mode: "Markdown" }, kb.summon())));
			});
		} else {
			bot.sendMessage(msg.from.id, headerMessage);
		}
	})
});

bot.on("channel_post", function(msg) {
	if (msg.chat.username && msg.chat.username === "techbinder") {

		let queries = [
			`SELECT * from timematch WHERE link = $link;`,
			`UPDATE timematch SET times = times + 1, last_time = date('now') WHERE link = $link`
		];

		fetchMessage("content", { message: msg.text }).then(function(post) {
			db.get(queries[0], { $link: post.link }, function(err, get) {
				if (err) {
					new utils.QueryError("send.chpost$0", { $link: post.link }, err);
				}

				if (!get) {
					db.run(queries[1])
				}
			});

			db.run(Query, { $link: post.link+"%" }, function(err) {
				if (err) {
					new utils.QueryError("send.channel_post$0", { $link }, err);
				}
			});
		});
	}
});

module.exports = {
	commands: {
		public: [{
			command: "/send",
			args: "",
			description: "Sends a content to be approved to the channel",
		}],
		private: [{
			command: "/list",
			args: "#hashtag [#hashtag ...]",
			description: "Retrieves the list of interesting posts based on topic search."
		}, {
			command: "/evoke_<mid>",
			args: "",
			description: "Retrieves a specific post based on its mid."
		}],
	},
	_init: function(mods) {
		mods.forEach(m => comodules.push(m.name));
	}
};
