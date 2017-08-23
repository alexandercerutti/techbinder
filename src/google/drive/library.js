const utils = require("../../utils.js");
const manager = require("../../manager.js");
const fs = require("fs");
const drive = new (require("./drive.js"))();

const bot = utils.bot;
const Keyboard = utils.Keyboard;
const InlineKeyboard = utils.InlineKeyboard;
const ƒ = manager.ƒ;

const paths = {};

fs.access(`${process.env.DATA_DIR}`, fs.constants.F_OK, (err) => {
	const header = !err ? process.env.DATA_DIR : "./data/";
	paths.permissions = header+"permissions.json";
	paths.driveRef = header+"driveref.json";
});

/**
 * Adds the permission to access to the library to the specified address
 *
 * @function requestAccess
 * @params {string} address - email to authorize
 */

function requestAccess(address) {
	return new Promise(function(success, reject) {
		drive.access(address)
			.then(success)
			.catch(reject);
	});
}

/**
 * Let the staff revoke the permission of a user to access to the library
 *
 * @function removeAuth
 * @params {string} address - email address to which revoke the access
 */

function removeAuth(address) {
	return new Promise((success, reject) => {
		utils.getDataList(paths.permissions)
			.then(list => {
				const permissionId = list.find(value => address === value.emailAddress).id;

				if (!permissionId) {
					return reject("Utente non trovato.");
				}

				drive.remove(permissionId)
					.then(success)
					.catch(reject);
			})
			.catch(reject);
	});
}

/**
 * Fetches Google Drive library access and write them back to permissions.json
 *
 * @function updatePermissions
 */

function updatePermissions() {
	drive.get()
		.then(permissions => {
			fs.writeFile(paths.permissions, JSON.stringify(permissions, null, "\t"), "utf-8", function(){});
		})
		.catch(err => {
			console.log(`Cannot get permissions. ${err}`);
		});
}

/**
 * Create the list of documents in a Google Drive folder
 *
 * @function listBooks
 * @params {string=} category - folder name
 * @params {boolean=} last - if true the list will contain only the last added document, otherwise will contain all the documents
 * @returns {Promise}
 */

function listBooks(category, last = false) {
	return new Promise(function(success, reject){
		utils.getDataList(paths.driveRef)
			.catch(reject)
			.then(index => {
				let message;
				const indentation = "\t\t\t\t";
				if (!category) {
					message = "Through this command you can browse _Library_/_Development_/_Books_."
							+ "\nFor other contents, visit Google Drive at "
							+ "[this link](https://drive.google.com/drive/u/0/folders/0B4W2RvMS01JpUE9nRWJIakhzMlE)."
							+ "\n\nTo get books list right here, pick one of the following symlinks and write it straight after "
							+ "the command. Use `last` to get the last book added to a category.\n\n";

					for (const key in index) {
						message += `${indentation}_${key}_\n`;
					}

					message += `\nExamples:\n${indentation}/books gamedev\n${indentation}/books gamedev last\n\n`;

					return success(message);
				}

				// checking existance
				const symlink = {
					alias: Object.keys(index).find(key => key.replace("'", "") === category),
				};

				if (!symlink.alias) {
					return reject("Cannot retrieve the folder. Try again with a different category.");
				}

				symlink.name = index[symlink.alias].name;
				symlink.id = index[symlink.alias].id;

				drive.list(symlink.id, last)
					.then(files => {
						const driveHeader = "https://drive.google.com/file/d/";
						if (last) {
							message = `Last added book to *${symlink.name}* is:\n`;
						} else {
							message = `*${symlink.name}* folder contains:\n\n`;
						}

						for (const file of files) {
							// splitting the title (fileName[0]) by the author (fileName[1])
							const fileName = file.name.split(" - ");
							const doc = {
								name: fileName[0],
								hasAuthor: !!fileName[1], // may happen that some books have an unknown author
								//splitting the extension and then the authors
								authors: (fileName[1] ? fileName[1].slice(0, -4).split(",") : []),
							};

							// divisor among books
							const nextDiv = last || file.name === files[files.length-1].name ? "\n\n" : "===\n";
							message += `${indentation}([open](${driveHeader}${file.id}/view)) *${doc.name}*`;

							if (doc.hasAuthor) {
								if (doc.authors.length > 1) {
									// newline if the book has multiple authors.
									message += `\n${indentation}`;
									for (const author of doc.authors) {
										// checks if the actual author is the last of the list.
										const authorDiv = (author === doc.authors[doc.authors.length - 1] ? "" : " -");
										message += `_${author}_ ${authorDiv}`;
									}
								} else {
									message += ` - _${doc.authors[0]}_`;
								}
							}
							message += `\n${indentation}${nextDiv}`;
						}

						return success(message);
					})
					.catch(err => reject(err));
			});
	});
}

/**
 * Add a symlink to the symlinks list
 *
 * @function addSymlink
 * @params {string} alias - the name that will be shown in /books list
 * @params {string} id - google drive folder id
 * @params {string} name - the name of the folder
 */

function addSymlink(alias, id, name) {
	return new Promise(function(success, reject) {
		utils.getDataList(paths.driveRef)
			.then(symlinks => {
				if (Object.keys(symlinks).find(symlink => symlink === alias)) {
					return reject(`${alias} is already a symlink.`);
				}

				symlinks[alias] = {
					id: id,
					name: name,
				};

				fs.writeFile(paths.driveRef, JSON.stringify(symlinks, null, "\t"), "utf-8", success);
			})
			.catch(reject);
	});
}

// bot extensions

/*
 * Matches:
 * /books
 * /books x
 * /books x last
 * with x = section name that can contain "/" character.
 */
bot.onText(/\/books(?:\s+)?([\w+\/]+)?(?:\s+)?(last)?/i, function(msg, match) {
	bot.sendMessage(msg.from.id, "Loading data...").then(function(sent) {
		const struct = {
			message_id: sent.message_id,
			chat_id: sent.chat.id,
			options: { parse_mode: "Markdown" }
		};

		/*
		 * if match[1] is undefined, list will be the list of category
		 * if match[2] is undefined, list will not be all the last book added to the folder
		*/
		listBooks(match[1], !!match[2])
			.then(msg => utils.editMessage(Object.assign({ text: msg }, struct)))
			.catch(msg => utils.editMessage(Object.assign({ text: msg }, struct)));
	});
});

bot.onText(/\/addSymlink\s+([\w+\/]+)\s+([^\s]+)\s+(.+)/, function(msg, match){
	if (utils.isAdmin(msg.from.id)) {
		addSymlink(match[1], match[2], match[3])
			.then(() => bot.sendMessage(msg.from.id, `Symlinks updated successfully`))
			.catch(err => bot.sendMessage(msg.from.id, `Error while adding Symlink: ${err}.`));
	}
});

ƒ.library = {};

bot.onText(/\/getAuth\s+(\w+(?:\W+)?\w+\@(?:\.?\w+)+)/, function(msg, match) {
	const kb = new InlineKeyboard();
	kb.addRow({
		text: "Authorize",
		callback_data: JSON.stringify({src: "library", cmd: "auth", content: true})
	}, {
		text: "Deny",
		callback_data: JSON.stringify({src: "library", cmd: "auth", content: false})
	});

	// defining in there to not exceed the 64-bytes telegram limit in sending email address
	ƒ.library.auth = function(q) {
		const content = q.data.content;

		if (content) {
			// match[1] is the email address
			requestAccess(match[1])
				.then(function(message) {
					// sending messages and updating the file.
					const userMessage = {
						target: msg.from.id,
						content: `You have been authorized. Start by sending me /books command to discover how to get the books.`,
					};

					utils.send(userMessage);
					utils.editMessage({
						text: `${msg.from.id} is now authorized.`,
						message_id: q.message.message_id,
						chat_id: utils.destinations.channel,
					});
					updatePermissions();
				})
				.catch(function(reason) {
					const userMessage = {
						target: msg.from.id,
						content: `Your email address seems not to be valid. Google rejected your request.\n\nBad Request. invalidSharingRequest (email address not valid)`,
					};

					utils.send(userMessage);
					utils.editMessage({
						text: `Invalid email. *Google Error* : ${reason.message}.`,
						message_id: q.message.message_id,
						chat_id: utils.destinations.channel,
						options: { parse_mode: "Markdown" },
					});
				});
		} else {
			const userMessage = {
				target: msg.from.id,
				content: "Sorry, your request got rejected.",
			};

			utils.send(userMessage);
			utils.editMessage({
				text: `${msg.from.username} access request rejected.`,
				message_id: q.message.message_id,
				chat_id: utils.destinations.channel,
				options: { parse_mode: "Markdown" },
			});
		}
	};


	bot.sendMessage(msg.from.id, "Thank you. You will receive a message in case of confirmation or error.");
	bot.sendMessage(utils.destinations.channel, `@${msg.from.username} (${msg.from.id}) requested the access to the library with mail ${match[1]}.`, kb.summon());
});

bot.onText(/\/removeAuth\s+(\w+(?:\W+)?\w+\@(?:\.?\w+)+)/, function(msg, match) {
	if (utils.isAdmin(msg.from.id)) {
		removeAuth(match[1])
			.then(() => {
				updatePermissions();
				bot.sendMessage(msg.chat.id, `Auth removed for ${match[1]}.`);
			})
			.catch(function(message) {
				bot.sendMessage(msg.chat.id, `Cannot to revoke access: user with mail ${match[1]} not found.`);
			});
	}
});

module.exports = {
	commands: {
		public: [{
			command: "/getAuth",
			args: "<email address>",
			description: "Asks for the access to the library.",
		}, {
			command: "/books",
			args: "[] | [ <category symlink> [ last]]",
			description: "Returns the list of categories or the list of books in a category.",
		}],
		private: [{
			command: "/removeAuth",
			args: "<email address>",
			description: "Removes the access permissions to the library of a user.",
		}, {
			command: "/addSymlink",
			args: "<alias> <folder id> <name>",
			description: "Creates a new symlink to be shown on /books",
		}],
	},
};
