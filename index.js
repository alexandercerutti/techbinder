const fs = require("fs");

const modules = [{
	name: "feedback.js",
	description: "Feedback system"
}, {
	name: "google/drive",
	description: "Google Drive integration"
}, {
	name: "engine",
	description: "Send and ban functionalities"
}, {
	name: "subscription.js",
	description: "Subscription system"
}, {
	name: "bot.js",
	description: "main"
}];

function init(element, starter) { element = element || starter; }

let failedModules = 0;
modules.forEach(function getModules(module, index) {
	/**
	 * For each module, it checks if the files exists and loads it. Then it get its commands.
	 *
	 * @function getModules
	 * @params {Object} module - module name and informations
	 * @params {Integer} index
	 */
	if (!module.name) { return; }

	fs.stat(module.name, function() {
		try {
			let modjs = require(`./src/${module.name}`);
			init(modjs.commands, {});
			init(modjs.commands.public, []);
			init(modjs.commands.private, []);

			module.commands = modjs.commands;
			console.log(" \x1b[32m", "Module:", "\x1b[0m", "\x1b[33m", module.name, "\x1b[0m");
			if (modjs._init) {
				/*
				 * _init is the main function that a module can use to execute something on its loading
				 * also with a delay, by providing initDelay in milliseconds.
				 */
				if (module.initDelay) {
					setTimeout(() => modjs._init(modules), module.initDelay)
				} else {
					modjs._init(modules);
				}
			}

			if (index === modules.length-1) {
				console.log("\nBot loaded, running in background. Press CTRL+Z to leave it running.\n", failedModules ? `${failedModules} module(s) not loaded` : "");
			}
		} catch(e) {
			console.log(" \x1b[31m", "Module:", "\x1b[0m", "\x1b[33m", module.name, "\x1b[0m", "\n\n", e, "\n\n");
			failedModules++;
		}
	});
});
