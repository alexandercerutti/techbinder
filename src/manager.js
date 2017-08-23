const utils = require("./utils.js");
const moment = require("moment");
const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

const bot = utils.bot;
const userCallbacks = {}; // callbacks container for awaited messages.
const ƒ = {};

bot.on("callback_query", function(query) {
	bot.answerCallbackQuery(query.id).then(function() {
		let data = query.data = JSON.parse(query.data);
		// each ƒunction is defined in its own file (e.g. send.js defines commands setInteresting and Publish)
		ƒ[data.src][data.cmd](query);
	});
});

// Receives all the messages that not begin with command token "/" (e.g. /send is not recognized)
bot.onText(/^(?!\/)(.+)/, fireCallbacks);


// common functions

ƒ.common = {
	/**
	 * Cancels a sending action by a user
	 *
	 * @function cancel
	 * @params {Object} q - Telegram Callback Query Object
	 * @see https://core.telegram.org/bots/api#callbackquery
	 */

	cancel: function(q) {
		if (isPendingAction(q.from.id)) {
			forcePending(q.from.id);
			const content = q.data.content; 
			utils.editMessage({
				text: `${content ? content : "Action"} cancelled.`,
				message_id: q.message.message_id,
				chat_id: q.from.id,
				keyboard: {}
			});
		}
	},

	next: function(q) {
		fireCallbacks(q);
	}
}


	/**
	 * Executes the next callback in a user pending list, after an
	 * answer (as text or callback_data).
	 *
	 * @function fireCallbacks
	 * @param {(Object|string|number)} answer - data sent back by Telegram or user id.
	 * @see https://core.telegram.org/bots/api#message
	 * @see https://core.telegram.org/bots/api#user
	 */

	function fireCallbacks(answer) {
		const user = (function() {
			if (typeof answer !== "object") { return answer; }
			if (!!answer.message) { return answer.message.chat.id; }
			return answer.chat.id;
		})();

		if (isPendingAction(user)) {
			const callback = userCallbacks[user].shift();
			callback(answer);

			if (!userCallbacks[user].length) {
				delete userCallbacks[user];
			}
		}
	}

	/**
	 * Removes all pending actions for a user
	 *
	 * @function forcePending
	 * @param {(number|string)} user - user id
	 */

	function forcePending(user) {
		if (!user) {
			throw "Manager.forcePending: Missing user parameter.";
		}

		delete userCallbacks[user];
	}

	/**
	 * Removes the next pending action for a user
	 *
	 * @function forceNext
	 * @param {(number|string)} user - user id
	 */

	function forceNext(user) {
		if (!user) {
			throw "Manager.forceNext: Missing user parameter.";
		}

		userCallbacks[user].shift();
	}

	/**
	 * Removes the last pending action for a user
	 *
	 * @function forceLast
	 * @param {(number|string)} user - user id
	 */

	function forceLast(user) {
		if (!user) {
			throw "Manager.forceLast: Missing user parameter.";
		}

		userCallbacks[user].pop();
	}

	/**
	 * Checks if a user must still give an answer
	 *
	 * @function isPendingAction
	 * @param {(number|string)} user - user id
	 * @returns {boolean} - if there are still pending actions
	 */

	function isPendingAction(user) { return userCallbacks[user] && userCallbacks[user].length; }

	/**
	 * Sets a new pending action for a user
	 *
	 * @function setPendingAction
	 * @param {(number|string)} user - user id
	 * @param {function} callback - what is going to be executed after the user answer
	 */

	function setPendingAction(user, callback) {
		userCallbacks[user] = userCallbacks[user] || [];

		if (typeof callback === "function") {
			userCallbacks[user].push(callback);
		} else if (Array.isArray(callback)) {
			callback.forEach(function(fn) {
				userCallbacks[user].push(fn);
			});
		}

		return {
			setFirst: function() {
				/**
				 * Sets the last added function as first of the stack
				 * @function setFirst
				 * @methodof setPendingAction
				 */

				userCallbacks[user].unshift(userCallbacks[user].pop());
			}
		}
	}

	/**
	 * Gets the quantity of remained pending actions for a user
	 *
	 * @function getPendingLength
	 * @param {(number|string)} user - user id
	 * @returns {boolean} - the quantity of remained pending actions
	 */

	function getPendingLength(user) { return !userCallbacks[user] ? 0 : userCallbacks[user].length; }

	/**
	 * Returns the list of Pending functions for a user
	 *
	 * @function getPendingList
	 * @param {(number|string)} user - user id
	 * @returns {Object} - pending functions list
	 */

	function getPendingList(user) { return userCallbacks[user] || []; }

module.exports = {
	ƒ,
	forceNext,
	forceLast,
	fireCallbacks,
	forcePending,
	isPendingAction,
	setPendingAction,
	getPendingLength,
	getPendingList,
};
