import DB from './mod.js';

var cfg = {
		"db": {
	}
}

var db = new DB({
	...cfg.db,
	// initialQueries: ['SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci'],
}, cfg.ssh);

var ids = new Set;

// ids.add(1)

// db.select('SELECT * FROM User ORDER BY RAND() LIMIT 1').then(console.log)

// 	.finally(() => {
// 		db.end();
// 		console.log('done');
// 	});

// 0 &&


	Promise.all([
		db.select('SELECT * FROM User WHERE id IN (?)', ids),
		// db.q('UPDATE User SET comment = NOW() WHERE  id = 2'),
	])
	.then(res => {
		console.log(res, res[0])
	});
	
// 	db.pool.query(`


// 		`, [], (error, results, fields) => {

// 			console.log({error, results, fields});
// 		})

