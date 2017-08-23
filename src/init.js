const db = new (require("sqlite3")).Database((process.env.DATA_DIR || "data/")+"sbs.db");

/**
 * Sqlite Dump file as node script
 * Created for the first initialization or new modules installation
 */

const modulesQuery = {
	"send": [
		"CREATE TABLE IF NOT EXISTS `interesting_posts` (`link` varchar PRIMARY KEY);",
		"CREATE TABLE IF NOT EXISTS `suggested` (`message_id` integer, `link` varchar PRIMARY KEY, `message` text, `referencer` integer);",
		"CREATE TABLE IF NOT EXISTS `timematch` (`link` varchar PRIMARY KEY, `times` integer DEFAULT 0, `first_time` date, `last_time` date)",
		"CREATE TABLE IF NOT EXISTS `topic` (`id` integer PRIMARY KEY AUTOINCREMENT, `name` varchar(25) UNIQUE NOT NULL, `formatted` varchar(25));",
		"CREATE TABLE IF NOT EXISTS `argmatch` (`message_id` integer, `topic_id` integer, PRIMARY KEY(message_id, topic_id), FOREIGN KEY(message_id) REFERENCES suggested(message_id), FOREIGN KEY(topic_id) REFERENCES topic(id))",

		`INSERT OR IGNORE INTO topic (name, formatted) VALUES
		("programming", "Programming"), ("cpp", "C++"), ("java", "Java"), ("jvm", "JVM"), ("sql", "SQL"),
		("webdev", "Webdev"), ("php", "PHP"), ("nodejs", "Node.JS"),
		("webdesign", "Web Design"), ("html", "HTML"), ("css", "CSS"),
		("os", "OS"), ("windows", "Windows"), ("macos", "macOS"), ("linux", "Linux"), ("android", "Android"),
		("ai", "Artificial Intelligence"), ("algorithms", "Algorithms"), ("machinelearning", "Machine Learning"), ("deeplearning", "Deep Learning"),
		("uml", "UML"), ("tdd", "Test-Driven Dev."), ("testing", "Testing"), ("git", "Git"),
		("db", "Database"), ("server", "Server"),
		("iot", "IoT"), ("networking", "Networking"), ("security", "Security"), ("hardware", "Hardware"), ("gamedev", "Game Development"), ("technology", "Technology");`
	],
	"subscription": [
		"CREATE TABLE IF NOT EXISTS `keyboard` (`id` integer PRIMARY KEY AUTOINCREMENT, `name_id` varchar(25) UNIQUE NOT NULL, `show_name` varchar(30) UNIQUE NOT NULL);",
		`INSERT OR IGNORE INTO keyboard (name_id, show_name) VALUES ("dev", "Programming ▶️"), ("webdev", "Web Development ▶️"), ("os", "Operating Systems ▶️"), ("algo", "Algorithms & Co. ▶️"), ("engi", "Engineering ▶️"), ("dbs", "Database & servers ▶️"), ("others", "Miscellaneous ▶️");`,

		"CREATE TABLE IF NOT EXISTS `topic` (`id` integer PRIMARY KEY AUTOINCREMENT, `name` varchar(25) UNIQUE NOT NULL, `formatted` varchar(25));",
		"CREATE TABLE IF NOT EXISTS `KB_match` (`buttonID` integer, `topicID` integer, `kbID` integer, PRIMARY KEY(topicID, kbID), FOREIGN KEY(topicID) REFERENCES topic(id), FOREIGN KEY(kbID) REFERENCES keyboard(id));",
		"CREATE TABLE IF NOT EXISTS `talias` (`name` varchar(25), `torigin` integer, PRIMARY KEY (name, torigin), FOREIGN KEY (torigin) REFERENCES topic(id));",

		// Keyboards buttons definition
		`INSERT OR IGNORE INTO topic (name, formatted) VALUES
		("programming", "Programming"), ("cpp", "C++"), ("java", "Java"), ("jvm", "JVM"), ("sql", "SQL"),
		("webdev", "Webdev"), ("php", "PHP"), ("nodejs", "Node.JS"),
		("webdesign", "Web Design"), ("html", "HTML"), ("css", "CSS"),
		("os", "OS"), ("windows", "Windows"), ("macos", "macOS"), ("linux", "Linux"), ("android", "Android"),
		("ai", "Artificial Intelligence"), ("algorithms", "Algorithms"), ("machinelearning", "Machine Learning"), ("deeplearning", "Deep Learning"),
		("uml", "UML"), ("tdd", "Test-Driven Dev."), ("testing", "Testing"), ("git", "Git"),
		("db", "Database"), ("server", "Server"),
		("iot", "IoT"), ("networking", "Networking"), ("security", "Security"), ("hardware", "Hardware"), ("gamedev", "Game Development"), ("technology", "Technology");`,

		`INSERT OR REPLACE INTO KB_match VALUES
		(0, 1, 1),  (1, 2, 1),  (2, 3, 1),  (2, 4, 1),  (3, 5, 1),
		(0, 6, 2),  (1, 7, 2),  (2, 8, 2),  (3, 9, 2),  (4, 10, 2), (5, 11, 2),
		(0, 12, 3), (1, 13, 3), (2, 14, 3), (3, 15, 3), (4, 16, 3),
		(0, 17, 4), (1, 18, 4), (2, 19, 4), (2, 20, 4),
		(0, 21, 5), (1, 22, 5), (2, 23, 5), (3, 24, 5),
		(0, 25, 6), (1, 26, 6),
		(0, 27, 7), (1, 28, 7), (2, 29, 7), (3, 30, 7), (4, 31, 7), (5, 32, 7);`,

		"CREATE TABLE IF NOT EXISTS user (`user_id` integer PRIMARY KEY, `join_date` date);",
		"CREATE TABLE IF NOT EXISTS subscription (`user_id` integer, `topicID` integer, FOREIGN KEY(user_id) REFERENCES user(user_id), FOREIGN KEY(topicID) REFERENCES topic(id), PRIMARY KEY (user_id, topicID));",
		"CREATE TABLE IF NOT EXISTS queue (`user_id` int, `message_id` varchar(20), `channel_id` varchar(30), FOREIGN KEY(user_id) REFERENCES user(user_id), PRIMARY KEY(user_id, message_id, channel_id));",

		`INSERT OR IGNORE INTO topic (name) VALUES ("startup"), ("asm"), ("telegram"), ("backend"), ("tricks"), ("exploit"), ("microsoft"), ("dos"),
		("source"), ("es6"), ("sdl2"), ("security"), ("google"), ("oracle"), ("atom"), ("plugins"), ("privacy"),
		("storage"), ("pointers"), ("performance"), ("report"), ("complexity"),
		("sysadmin"), ("worstpractices"), ("software"), ("ssd"), ("interpreter"),
		("hacking"), ("imageprocessing"), ("auth"), ("intel"), ("bash"), ("chrome"), ("development"), ("openssl"), ("typescript"),
		("math"), ("swift"), ("bugs"), ("jpeg"), ("architecture"), ("shell"), ("robotics"), ("v8"), ("react"), ("biometry"),
		("sqlserver"), ("sql"), ("deeplearning"), ("oauth"), ("space"), ("health"), ("svg"), ("floatingpoint"), ("browser"), ("bitwiseops"),
		("flash"), ("mozilla"), ("reversing"), ("malware"), ("dart"), ("angularjs"), ("api"), ("docs"), ("bugbounty"), ("w3c"),
		("html5"), ("ransomware"), ("science"), ("hashing"), ("tor"), ("internet"), ("multithreading"),
		("optimization"), ("css3"), ("bestpractices"), ("symfony"), ("dotnet"),
		("nginx"), ("http2"), ("cracking"), ("usb"), ("scalability"), ("bigdata"), ("leak"), ("communications"),
		("learning"), ("fix"), ("concurrency"), ("books"), ("mysql"), ("xiaomi"), ("fpu"), ("connectivity"), ("graphics"), ("go"),
		("python"), ("ibm"), ("cloud"), ("json"), ("cpu"), ("networking"), ("charset"), ("opensource"), ("compression"),
		("seo"), ("scavix"), ("webkit"), ("gpu"), ("computing"), ("arduino"), ("nosql"), ("saas"), ("postgresql"), ("github"),
		("mongodb"), ("redis"), ("designpatterns"), ("tracking"), ("jwt"),
		("prototyping"), ("http"), ("fonts"), ("webpack"), ("facebook"), ("docker"), ("wordpress"), ("sound"),
		("research"), ("internals"), ("ios"), ("mariadb"), ("redhat"), ("paas");`,
	],
	"ban": [
		"CREATE TABLE IF NOT EXISTS `ban_users` (`id` integer PRIMARY KEY);",
		"CREATE TABLE IF NOT EXISTS `ban_sites` (`domain` varchar(50) PRIMARY KEY);",
		`INSERT OR IGNORE INTO ban_sites VALUES ("xnxx.com"), ("pornhub.com"), ("youporn.com"), ("youporngay.com"), ("xvideos.com"), ("brazzers.com"),
		("redtube.com"), ("gufoporno.com"), ("youjizz.com"), ("xhamster.com");`
	],
	"feedback": [
		"CREATE TABLE IF NOT EXISTS `feedbacks` (`user_id` integer PRIMARY KEY, `date` date, `message` text);",
	]
};


db.serialize(function() {
	if (process.argv[2]) {
		if (!modulesQuery[process.args[2]]) {
			console.log("The specified module does not exist.\n\nEnding...\n");
			return;
		}

		modulesQuery[process.args[2]].forEach(function(query) {
			db.run(query, function(err) {
				if (err) {
					console.log(err, "on execution of query \n", query);
				}
			});
		});

		return;
	}

	db.run("PRAGMA foreign_keys = ON;");
	db.run("BEGIN TRANSACTION;");
	console.log("\n");
	Object.keys(modulesQuery).forEach(function(module) {
		console.log("\x1b[32m", "Module:", "\x1b[33m", module, "\x1b[0m");
		modulesQuery[module].forEach((query) => db.run(query, function(err) {
			if (err) {
				console.log(err, "on execution of query", query);
			}
		}));
	});
	db.run("COMMIT TRANSACTION;");
	console.log("\n\x1b[42m", "Completed.", "\x1b[0m\n");
});
