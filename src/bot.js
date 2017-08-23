const utils = require("./utils.js");

const bot = utils.bot;
function _init(modules) {

	bot.onText(/\/start/, function(msg) {
		/**
		 * First message on bot /start
		 *
		 * @function <anonymous>
		 * @params {Object} msg - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */

		const message = `Hi, I am TechBinderbot, a bot manager for @techbinder channel. You can send me the following commands:
						\t\t•\t\t(/send) \`Share\` a resource with the community
						\t\t•\t\t(/feedback) Leave us a \`feedback\`.
						I will lead you in both functions.
						\t\t•\t\t(/subscribe) Subscribe to your favourite topics and get updated when new posts are available
						Keep following us, at @techbinder. Happy tech!`;
		bot.sendMessage(msg.from.id, message, {parse_mode: "Markdown"});
	});

	bot.onText(/\/faq/, function(msg) {
		bot.sendMessage(msg.from.id, `We wrote FAQs to telegra.ph. Please, read them here: http://telegra.ph/Syras-Techbinder-FAQs-05-20-2`);
	});

	/* bot basic functionalities */
	bot.onText(/\/myData/, function(msg) {
		/**
		 * Returns user personal data
		 *
		 * @function <anonymous>
		 * @params {Object} msg - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */
		bot.sendMessage(msg.from.id, `Hi ${msg.from.username}, here's your datas:\n\n${JSON.stringify(msg.from)}`);
	});

	bot.onText(/\/getUser\s+([0-9]+)/, function(msg, match) {
		/**
		 * Returns user nickname. If command sender
		 * is not an admin, nothing is returned
		 *
		 * @function <anonymous>
		 * @params {Object} msg - Telegram Message Object
		 * @params {Object} match - regex matches
		 * @see https://core.telegram.org/bots/api#message
		 * @see https://github.com/yagop/node-telegram-bot-api/blob/release/doc/usage.md
		 */

		if (!utils.isAdmin(msg.from.id)) return;

		bot.getChat(Number(match[1])).then(user => {
			bot.sendMessage(msg.from.id, `User: @${user.username}`);
		}).catch(err => {
			bot.sendMessage(msg.from.id, `User not found.\n\n${err}`);
		});
	});

	bot.onText(/\/admins/, function(msg, match) {
		/**
		 * Returns a list of commands for admins. If command sender
		 * is not an admin, nothing is returned
		 *
		 * @function <anonymous>
		 * @params {Object} msg - Telegram Message Object
		 * @see https://core.telegram.org/bots/api#message
		 */
		if (!utils.isAdmin(msg.from.id)) return;

		let commands = ``;

		modules.forEach(function(wrapper, index) {
			if (index !== modules.length-1) {
				if (wrapper.commands.private && wrapper.commands.private.length) {
					commands += `\n\n*${wrapper.name}* module`;
					wrapper.commands.private.forEach(function(module) {
						commands += `\n\t\t\t\t${module.command} ${module.args || ""}
									\t\t\t\t_${module.description}_`;
					});
				}
			}
		});

		bot.sendMessage(msg.from.id, `Here's the list of commands for admins:${commands}`, { parse_mode: "Markdown" });
	});
};

module.exports = {
	commands: {
		public: [{
			command: "/myData",
			args: "",
			description: "Returns user data as JSON stringified object."
		}],
		private: [{
			command: "/getUser",
			args: "<user id>",
			description: "Returns a follower nickname",
		}, {
			command: "/admins",
			args: "",
			description: "This command.",
		}],
	},
	_init,
}
