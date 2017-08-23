const utils = require("../utils.js");
const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

const bot = utils.bot;

/* Function Definitions */

/**
 * Adds a URL to the database so it cannot be sent.
 *
 * @function banSite
 * @param {String} target - website to be banned
 */

function banSite(target) {
	return new Promise(function(success, reject) {
		const query = `INSERT OR IGNORE INTO ban_sites VALUES ($domain);`;
		const urlParsed = utils.getHostname(target);
		db.run(query, {$domain: urlParsed}, function(err) {
			if (err) {
				new utils.QueryError("unban", {
					"$domain": urlParsed,
				}, err);
				return reject("Error.");
			}

			return success();
		});
	});
}

/**
 * Adds a non listed user to the ban list
 *
 * @function ban
 * @param {Integer} target - userID
 */

function ban(target) {
	return new Promise(function(success, reject) {
		let query = `INSERT OR IGNORE INTO ban_users VALUES ($user)`;
		db.run(query, {$user: Number(target)}, function(err) {
			if (err) {
				new utils.QueryError("unban", {
					"$user": Number(target),
				}, err);
				return reject("Error.");
			}

			return success();
		});
	});
}

/**
 * Removes listed user to the ban list
 *
 * @function unban
 * @param {Integer} target - userID
 */

function unban(target) {
	return new Promise((success, reject) => {
		let query = `DELETE FROM ban_users WHERE id = $user`;
		db.run(query, {$user: Number(target)}, function(err) {
			if (err) {
				new utils.QueryError("unban", {
					"$user": Number(target),
				}, err);
				return reject("Error.");
			}

			return success();
		});
	});
}

// bot extensions
bot.onText(/\/ban\s+([0-9]+)/, function(msg, match) {
	// Not continuing if the user who sent the command is not admin or if the target user is an admin
	if (!utils.isAdmin(msg.from.id) || utils.isAdmin(match[1])) return;

	ban(match[1])
		.then(function() {
			bot.sendMessage(msg.from.id, `${match[1]} è stato bannato.`);
		})
		.catch(function(err) {
			console.log(err);
		});
});

bot.onText(/\/unban\s+([0-9]+)/, function(msg, match) {
	// Not continuing if the user who sent the command is not admin or if the target user is an admin
	if (!utils.isAdmin(msg.from.id) || utils.isAdmin(match[1])) return;

	unban(match[1])
		.then(function() {
			bot.sendMessage(msg.from.id, `${match[1]} è stato sbannato.`);
		})
		.catch(function(err) {
			console.log(err);
		});
});

bot.onText(/\/bansite\s+([\/:\.\?=&@-_a-zA-Z0-9]+)/i, function(msg, match) {
	if (!utils.isAdmin(msg.from.id)) return;

	banSite(match[1]).then(function() {
		bot.sendMessage(msg.from.id, `${utils.getHostname(match[1])} è stato bannato!`, { disable_web_page_preview: true });
	});
});

module.exports = {
	commands: {
		private: [{
			command: "/ban",
			args: "<userid>",
			description: "Ban a user",
		}, {
			command: "/unban",
			args: "<userid>",
			description: "Unban a user",
		}, {
			command: "/bansite",
			args: "<site>",
			description: "Ban permanently a resource",
		}],
		public: [],
	},
};

