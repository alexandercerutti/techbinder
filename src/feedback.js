const manager = require("./manager.js");
const utils = require("./utils.js");
const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

const ƒ = manager.ƒ;

const canAdminSendFeedback = false;
const InlineKeyboard = utils.InlineKeyboard;
const bot = utils.bot;

ƒ.feedback = {
	cancel: function(q) {
		const editDetails = {
			chat_id: q.from.id,
			message_id: q.message.message_id,
			parse_mode: "Markdown",
		};

		manager.forcePending(q.from.id);
		bot.editMessageText("*Feedback creation has been cancelled.*", editDetails);
	},

	skip: function(q) {
		const editDetails = {
			chat_id: q.from.id,
			message_id: q.message.message_id,
			parse_mode: "Markdown",
		};

		bot.editMessageText(`You can leave us a more detailed feedback, that includes such your favorite topics, when and how you known techbinder, or you can Skip. * *\\[ *skipped* \]`, editDetails)
		.then(() => ƒ.common.next(q));
	},

	vote: ƒ.common.next
};



function Feedback(user) {
	const userMessage = {
		target: user.id,
		content: "Great! Thank you for your feedback! We'll may contact you for more details. 😉",
		getMID: false,
	};
	const staffMessage = {
		target: utils.destinations.channel,
		content: "",
		getMID: false,
	};
	const feedbackData = {
		user: user.id,
		message: "",
	}

	const numberGrid = new InlineKeyboard();
	numberGrid.addRow(
		{ text: "1",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 1}) },
		{ text: "2",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 2}) },
		{ text: "3",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 3}) },
		{ text: "4",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 4}) },
		{ text: "5",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 5}) }
	).addRow(
		{ text: "6",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 6}) },
		{ text: "7",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 7}) },
		{ text: "8",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 8}) },
		{ text: "9",  callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 9}) },
		{ text: "10", callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: 10}) }
	).addRow({
		text: "Cancel",
		callback_data: JSON.stringify({src: "common", cmd: "cancel", content: "Feedback"})
	});

	loadFeedback(user.id).then(function(feedback) {
		bot.sendMessage(user.id, `Hi ${user.username}.`).then(function(){
			manager.setPendingAction(user.id, function intro(answer) {
				/**
				 * Summons the keyboard containing votes buttons
				 *
				 * @callback setPendingAction~intro
				 * @params {Object} answer - Telegram Message Object
				 * @see https://core.telegram.org/bots/api#message
				 */

				bot.sendMessage(user.id, "How would you rate @techbinder and its posts? [1-10]", numberGrid.summon());
			});

			if (feedback) {
				const alreadyLeft = new InlineKeyboard();
				alreadyLeft.addRow({
					text: "Yes ✅",
					callback_data: JSON.stringify({src: "feedback", cmd: "vote", content: true})
				}, {
					text: "No ❌",
					callback_data: JSON.stringify({src: "common", cmd: "cancel", content: "Feedback"})
				});

				bot.sendMessage(user.id, `It seems you already left us a feedback. Do you want to edit it?`, alreadyLeft.summon());

				// existing feedback
				manager.setPendingAction(user.id, function(answer) {
					/**
					 * Pressed button determines what to execute
					 *
					 * @callback setPendingAction~anonymous
					 * @params {Object} answer - Telegram Message Object
					 * @see https://core.telegram.org/bots/api#message
					 */

					if (!answer.data.content) {
						manager.forcePending(user.id);
					} else {
						utils.editMessage({
							text: "How would you rate @techbinder and its posts? [1-10]",
							message_id: answer.message.message_id,
							chat_id: user.id,
							keyboard: numberGrid.extract("content"),
						});

						manager.forceNext(user.id);
					}
				}).setFirst();
			} else {
				manager.fireCallbacks(user.id);
			}

			manager.setPendingAction(user.id, function voteAnswer(answer) {
				/**
				 * Edits last message writing inside it the vote and sends a new message for a custom message.
				 *
				 * @callback setPendingAction~voteAnswer
				 * @params {Object} answer - Telegram Message Object
				 * @see https://core.telegram.org/bots/api#message
				 */

				const editDetails = {
					chat_id: answer.from.id,
					message_id: answer.message.message_id,
					parse_mode: "Markdown",
				};

				const vote = answer.data.content;

				feedbackData.message += `Vote ${vote}/10`;
				staffMessage.content += `@${user.username} (${user.id}) released a #feedback of *${vote}/10*\n`;

				let kb = new InlineKeyboard({
					text: "Skip",
					callback_data: JSON.stringify({src: "feedback", cmd: "skip"})
				});
		
				bot.editMessageText(`How would you rate @techbinder and its posts? * *\\[ You chose: *${vote}* \]`, editDetails).then(function() {
					bot.sendMessage(user.id, "You can leave us a more detailed feedback, that includes such your favorite topics, when and how you discovered techbinder, or you can Skip.", kb.summon());
				});
			});

			manager.setPendingAction(user.id, function customMessageAnswer(answer) {
				/**
				 * Writes the custom message if available, and writes on file the feedback
				 *
				 * @callback setPendingAction~customMessageAnswer
				 * @params {Object} answer - Telegram Message Object
				 * @see https://core.telegram.org/bots/api#message
				 */

				if (answer && answer.text) {
					staffMessage.content += `*Message*: ${answer.text}`;
					feedbackData.message += ` - Message: ${answer.text}`;
				}

				staffMessage.content += `${utils.isAdmin(user.id) && !canAdminSendFeedback ? "**\\[ *not registered* \]" : ""}`;

				writeFeedback(feedbackData);
				bot.sendDocument(user.id, "BQADBAADIQADzAt2Dv1WBHCeziWlAg", { caption: "As thanksgiving for your feedback, here's a cute Baymax deflating. We hope you'll appreciate it. 😊" })
					.then(function(){})
					.catch(function(e) { console.log("This bot is not allowed to send this document."); })
				return utils.send(userMessage, staffMessage);
			});
		});
	});
}

/**
 * Loads the feedback file and checks if the user already left one
 *
 * @function loadFeedback
 * @params {(number|string)} user - user id
 * @returns {Promise.<Success, Error>} - contains the feedback object found, undefined otherwise
 */

function loadFeedback(user) {
	return new Promise(function(success, reject) {
		let query = `SELECT * FROM feedbacks WHERE user_id = $user;`;
		db.get(query, {$user: user}, function(err, get) {
			if (err) {
				new utils.QueryError("loadFeedback", {
					"$user": user,
				}, err);
				return reject({ message: "Query Error" });
			}
			return success(get)});
	});
}

/**
 * Writes in feedback file the new or updated feedback
 *
 * @function writeFeedback
 * @params {Object} fbdata - feedback data
 */

function writeFeedback(fbdata){
	if (utils.isAdmin(fbdata.user) && !canAdminSendFeedback) {
		utils.send({
			target: fbdata.user,
			content: "Admins cannot register feedbacks. To let this, please set to *true* the flag _canAdminSendFeedback_ in the source. (Disabling suggested in case of testing).",
			options: {
				parse_mode: "Markdown",
			}
		});
		return false;
	}

	let query = `INSERT OR REPLACE INTO feedbacks VALUES ($user, date('now'), $message);`;

	db.run(query, { $user: fbdata.user, $message: fbdata.message }, function(err) {
		if (err) {
			new utils.QueryError("writeFeedback", {
				"$user": fbdata.user,
				"$message": fbdata.message,
			}, err);
		}

		if (canAdminSendFeedback && utils.isAdmin(fbdata.user)) {
			return utils.send({
				target: fbdata.user,
				content: "*You are an admin. Remember to set back to false* _canAdminSendFeedback_ *flag in* _feedback.js_.",
				options: {
					parse_mode: "Markdown",
				},
			});
		}
	});
}

// bot extensions
bot.onText(/\/feedback/, msg => Feedback(msg.from));

module.exports = {
	commands: {
		public: [{
			command: "/feedback",
			args: "",
			description: "Summons feedback system keyboard",
		}],
	},
};
