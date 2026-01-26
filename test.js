import DB from './mod.js';

var db = new DB({
	...cfg.db,
	// initialQueries: ['SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci'],
}, cfg.ssh);


// db.select('SELECT * FROM User ORDER BY RAND() LIMIT 1').then(console.log)

// 	.finally(() => {
// 		db.end();
// 		console.log('done');
// 	});

// 0 &&


	Promise.all([
		// db.q('UPDATE User SET comment = NOW() WHERE  id = 1'),
		// db.q('UPDATE User SET comment = NOW() WHERE  id = 2'),
		db.q(Deno.readTextFileSync('../../../klad/restricted/configurator/db/larson.sql'), []),
	])
	.then(console.log);
	
// 	db.pool.query(`


// 		`, [], (error, results, fields) => {

// 			console.log({error, results, fields});
// 		})

