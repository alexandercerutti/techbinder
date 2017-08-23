const GService = require("../auth.js");

const GDRIVE_LIB_ID = "0B4W2RvMS01JpUE9nRWJIakhzMlE";

class Drive {
	constructor(){
		this.gdrive = new GService({
			name: "drive",
			version: "v3",
		}, ["drive", "drive.file"]).service;
	}

	access(address) {
		return new Promise((authCompleted, authRejected) => {
			const permissions = this.gdrive.permissions;
			permissions.create({
				fileId: GDRIVE_LIB_ID,
				sendNotificationEmail: false,
				resource: {
					role: "reader",
					type: "user",
					emailAddress: address,
				},
			}, err => {
				if (err) { return authRejected(err.errors[0]); }
				return authCompleted();
			});
		});
	}

	get(permissionId = null) {
		return new Promise((success, reject) => {
			const permissions = this.gdrive.permissions;
			const data = {
				fileId: GDRIVE_LIB_ID,
				fields: "permissions(displayName, emailAddress, id)",
			};

			if (permissionId) {
				data.permissionId = permissionId;

				permissions.get(data, (err, response) => {
					if (err) { return reject(err); }
					return success(response);
				});
			} else {
				permissions.list(data, (err, response) => {
					if (err) { return reject(err); }
					return success(response.permissions);
				});
			}
		});
	}

	remove(permissionId) {
		return new Promise((success, reject) => {
			const permissions = this.gdrive.permissions;
			if (!permissionId) {
				return reject("Error: cannot delete permission. PermissionId missing.");
			}

			permissions.delete({
				fileId: GDRIVE_LIB_ID,
				permissionId,
			}, (err, response) => {
				if (!err && !response) { return success(); }
				return reject(err);
			});
		});
	}

	list(key, last = false) {
		return new Promise((success, reject) => {
			const files = this.gdrive.files;

			let params = {
				q: `'${key}' in parents and fullText contains "pdf"`,
				fields: "files(id, name)",
			};
			if (last) { params.pageSize = 1; }

			files.list(params, (err, response) => {
				if (err) { return reject(`Cannot list files: ${err}`); }
				return success(response.files);
			});
		});
	}
}

module.exports = Drive;
