/* @ts-self-types="./mod.d.ts" */
import mysql from 'npm:mysql2@latest';
import * as f from '@frankbakulov/utils';
import fssh from '@frankbakulov/fssh';
import { EventEmitter } from 'node:events';

var pools = {}; // host:port@db => pool

export default class DB {
	pool;
	ssh;
	queryStack = [];
	ee;
	config;
	sshConfig;
	isQueryRunning = false;

	constructor(config, sshConfig) {
		if (typeof config === 'string') {
			config = f.readJsonSync(config);
		}

		this.config = config;
		this.sshConfig = sshConfig;
	}

	create(config, sshConfig) {
		config.port ||= 3306;
		if (sshConfig) {
			// mysql via ssh tunnel will crash with ER_NET_PACKETS_OUT_OF_ORDER, parallel queries are not supported
			this.ee = new EventEmitter();
			this.ssh = new fssh();
			return this.ssh.connect({
				...sshConfig,
				forwardHost: config.host,
				forwardPort: config.port,
			}, 'forward')
				.then((stream) =>
					this.connect({
						...config,
						stream,
					})
				);
		}

		return this.connect(config);
	}

	end() {
		return Promise.all(
			Object.values(pools).map((pool) =>
				new Promise((resolve, reject) => {
					pool.end((error) => {
						error ? reject(error) : resolve();
					});
				}),
			),
		).then(() => {
			pools = {};
			return this.ssh?.end();
		}).then(() => new Promise(setTimeout));
	}

	static screen(l) {
		return typeof l === 'string'
			? `'${l.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
			: (l === null || l === undefined
				? 'NULL'
				: (typeof l === 'object' ? `'${JSON.stringify(l)}'` : l));
	}

	escape(q, quote = false, addPerc = false) {
		var r = 'NULL';
		if (q !== null && q !== undefined) {
			q = String(q);
			r = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/"/g, '""');
			if (addPerc) {
				r += '\\%';
			}
			quote && (r = `"${r}"`);
		}
		return r;
	}

	connect(config) {
		var k = `${config.host}:${config.port}@${config.db}`;
		if (pools[k]) {
			return Promise.resolve(this.pool = pools[k]);
		}

		pools[k] = this.pool = mysql.createPool({
			host: config.host,
			port: config.port,
			stream: config.stream,
			user: config.user,
			password: config.pass,
			database: config.db,
			dateStrings: true,
			decimalNumbers: true,
			waitForConnections: true,
			multipleStatements: true,
			keepAliveInitialDelay: 10000,
			enableKeepAlive: true,
		});

		return Promise.all((config.initialQueries || []).map((q) => this.q(q)))
			.then(() => this.pool);
	}

	#result(data, is_col, sql) {
		var cols = data.shift(), ci = [],
			getRowObject = (r) => {
				if (is_col) {
					return r[cols.findIndex((_, i) => !ci.includes(i))];
				}

				let row = {};
				cols.forEach((c, i) => ci.includes(i) || (row[c] = r[i]));
				return row;
			},
			setResult = (cIndex, row, pointer) => {
				var k = row[ci[cIndex]];
				if (cIndex === ci.length - 1) {
					if (Array.isArray(pointer)) {
						pointer.push(getRowObject(row));
					} else {
						pointer[k] = getRowObject(row);
					}
				} else {
					pointer[k] ||= row[ci[cIndex + 1]] === null ? [] : {};
					setResult(cIndex + 1, row, pointer[k]);
				}
			};

		if (!cols) return sql.includes('ARRAY_KEY') ? {} : [];

		cols.forEach((c, i) => {
			if (c.startsWith('ARRAY_KEY')) {
				ci[+c.replace('ARRAY_KEY', '').replace('_', '')] = i;
			}
		});

		ci = ci.filter((c) => c !== undefined);

		if (ci.length) {
			let result = {};
			data.forEach((r) => {
				setResult(0, r, result);
			});

			return result;
		}

		return data.map(getRowObject);
	}

	select(...args) {
		return this.query(...args).then((data) => this.#result(data, false, args[0]));
	}

	col(...args) {
		return this.query(...args).then((data) => this.#result(data, true, args[0]));
	}

	cell(...args) {
		return this.query(...args).then((data) => data[1] ? data[1][0] : null);
	}

	q(...args) {
		return this.query(...args);
	}

	row(...args) {
		return this.query(...args).then((data) => {
			let cols = data.shift();
			let row = {};
			cols?.forEach((c, i) => row[c] = data[0][i]);
			return row;
		});
	}

	query(...args) {
		var [sql, ...values] = args;
		sql = sql.trim();

		values = values.map((v) => v instanceof Set ? Array.from(v) : v);

		values = values.map(v => Array.isArray(v) && !v.length ? null : v);

		// cut ? inside strings
		var countPl = (sql) => {
			var a = sql.replace(/(['"])[^'"]*\?[^'"]*(['"])/g, '').split('');
			return a.filter((l, i) => l === '?' && a[i + 1] !== '?').length;
		},
			qPl = countPl(sql),
			formatInsert = () => {
				if (qPl === values.length) return;

				var firstValue = values.shift(), ins = [], cols;

				firstValue = Array.isArray(firstValue) ? firstValue : [firstValue];
				if (f.isObject(firstValue[0])) {
					ins = firstValue;
					cols = Object.keys(ins[0]);
					sql += ` (${cols.map((c) => `\`${c}\``).join()}) VALUES ${ins.map(() => `(${cols.map(() => '?').join()})`).join()
						}`;
					firstValue = values[0];
				}

				if (firstValue) {
					if (firstValue.length === 1 && firstValue[0] === null) {
						return false;
					}
					let odku = Array.isArray(firstValue) ? firstValue : [firstValue];
					sql += ` AS a80 ON DUPLICATE KEY UPDATE ${odku.map((c) => `\`${c}\`=a80.${c}`).join()
						}`;
				}

				values = ins.reduce((p, c) => {
					p = p.concat(Object.values(c));
					return p;
				}, []);
			},
			formatUpdate = () => {
				var iSet = sql.indexOf('SET ?');
				if (iSet === -1) return; // not for object

				var iValues = countPl(sql.slice(0, iSet)),
					upd = values[iValues];

				if (!f.isObject(upd)) {
					return Promise.reject(
						`sql ${sql} has wrong value for SET: ${JSON.stringify(upd)}`,
					);
				}

				// replace this ? in sql to col = ?,

				// 4 - 'SET ', 5 - 'SET ?'
				sql = sql.slice(0, iSet + 4) + Object.keys(upd).map((c) =>
					`\`${c}\`=?`
				).join() + sql.slice(iSet + 5);

				// splice this index in values to val
				values.splice(iValues, 1, ...Object.values(upd));
			},
			formatPlaceholders = () => {
				var pholders = [...sql.replace(/(['"][^'"]*)(\?)([^'"]*['"])/g, '$1_$3').matchAll(/\?\w+/g)];

				for (let i = pholders.length - 1; i >= 0; i--) {
					let ph = pholders[i][0],
						index = pholders[i].index,
						type = ph.slice(1);

					switch (type) {
						case 'day':
						case 'month':
							sql = sql.slice(0, index) + ('BETWEEN ? AND ? + INTERVAL 1 ' + type) + sql.slice(index + ph.length);
							let newValue = type === 'day' ? values[i] : values[i].slice(0, 8) + '01';
							values.splice(i, 1, newValue, newValue);
							break;
					}
				}
			};

		var isQuery;
		if (sql.startsWith('INSERT') || sql.startsWith('REPLACE')) {
			isQuery = formatInsert();
		} else if (sql.startsWith('UPDATE')) {
			formatUpdate();
		}

		formatPlaceholders();

		if (isQuery === false) {
			return 0;
		}

		return this.create(this.config, this.sshConfig).then(() => {
			if (this.ee && this.isQueryRunning) {
				return new Promise((resolve, reject) => {
					var queryId;
					while (this.queryStack.includes(queryId = Math.random()));
					this.queryStack.push(queryId);
					this.ee.on(queryId, () => {
						this.doQuery(sql, values).then(resolve).catch(reject);
					});
				});
			}
			return this.doQuery(sql, values);
		});
	}

	doQueryStack() {
		if (!this.queryStack[0] || this.isQueryRunning) return;

		// tunnel is free, removing from stack and emitting
		this.ee.emit(this.queryStack.shift());
	}

	doQuery(sql, values) {
		this.isQueryRunning = true;
		return new Promise((resolve, reject) => {
			this.pool.query(sql, values, (error, results, fields) => {
				this.isQueryRunning = false;
				this.doQueryStack();
				if (error) {
					return reject({
						code: error.code,
						coderrno: error.errno,
						sqlState: error.sqlState,
						sqlMessage: error.sqlMessage,
						sql: error.sql,
						message: error.message,
					});
				}
				if (!Array.isArray(results)) {
					if (sql.startsWith('SELECT')) {
						return resolve(results);
					}

					if (sql.startsWith('INSERT') && results.insertId) {
						return resolve(results.insertId);
					}

					if (sql.startsWith('UPDATE')) {
						return resolve(results.changedRows);
					}

					return resolve(results.affectedRows);
				}

				if (!results[0]) {
					return resolve(results);
				}

				let data = [Object.keys(results[0])]
					.concat(results.map((d) => Object.values(d)));
				resolve(data);
			});
		});
	}
}
