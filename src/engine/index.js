const ban = require("./ban.js");
const send = require("./send.js");

module.exports = {
	commands: {
		public: ban.commands.public.concat(send.commands.public),
		private: ban.commands.private.concat(send.commands.private),
	},
	_init: function(modules) {
		if (ban._init) { ban._init(modules); }
		if (send._init) { send._init(modules); }
	}
}
