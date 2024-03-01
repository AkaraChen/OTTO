function getRandomItem(array = []) {
	const index = Math.floor(Math.random() * array.length);
	const result = array[index];
	return result;
}

function playAudio(audioFile = "", v = 0.4) {
	const audio = new Audio(audioFile);
	audio.volume = v; //音量
	if (audio) audio.play();
}

class KeyboardInputManager {
	constructor() {
		this.events = {};

		if (window.navigator.msPointerEnabled) {
			//Internet Explorer 10 style
			this.eventTouchstart = "MSPointerDown";
			this.eventTouchmove = "MSPointerMove";
			this.eventTouchend = "MSPointerUp";
		} else {
			this.eventTouchstart = "touchstart";
			this.eventTouchmove = "touchmove";
			this.eventTouchend = "touchend";
		}

		this.listen();
	}
	on(event, callback) {
		if (!this.events[event]) {
			this.events[event] = [];
		}
		this.events[event].push(callback);
	}
	emit(event, data) {
		const callbacks = this.events[event];
		if (callbacks) {
			callbacks.forEach((callback) => {
				callback(data);
			});
		}
	}
	listen() {
		const map = {
			38: 0, // Up
			39: 1, // Right
			40: 2, // Down
			37: 3, // Left
			75: 0, // Vim up
			76: 1, // Vim right
			74: 2, // Vim down
			72: 3, // Vim left
			87: 0, // W
			68: 1, // D
			83: 2, // S
			65: 3, // A
		};

		// Respond to direction keys
		document.addEventListener("keydown", (event) => {
			const modifiers = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
			const mapped = map[event.which];

			// Ignore the event if it's happening in a text field
			if (this.targetIsInput(event)) return;

			if (!modifiers) {
				if (mapped !== undefined) {
					event.preventDefault();
					this.emit("move", mapped);
				}
			}

			// R key restarts the game
			if (!modifiers && event.which === 82) {
				this.restart.call(this, event);
			}
		});

		// Respond to button presses
		this.bindButtonPress(".retry-button", this.restart);
		this.bindButtonPress(".restart-button", this.restart);
		this.bindButtonPress(".keep-playing-button", this.keepPlaying);

		// Respond to swipe events
		let touchStartClientX;
		let touchStartClientY;
		const gameContainer = document.getElementsByClassName("game-container")[0];

		gameContainer.addEventListener(this.eventTouchstart, (event) => {
			if ((!window.navigator.msPointerEnabled && event.touches.length > 1) ||
				event.targetTouches > 1 ||
				this.targetIsInput(event)) {
				return; // Ignore if touching with more than 1 finger or touching input
			}

			if (window.navigator.msPointerEnabled) {
				touchStartClientX = event.pageX;
				touchStartClientY = event.pageY;
			} else {
				touchStartClientX = event.touches[0].clientX;
				touchStartClientY = event.touches[0].clientY;
			}

			event.preventDefault();
		});

		gameContainer.addEventListener(this.eventTouchmove, (event) => {
			event.preventDefault();
		});

		gameContainer.addEventListener(this.eventTouchend, (event) => {
			if ((!window.navigator.msPointerEnabled && event.touches.length > 0) ||
				event.targetTouches > 0 ||
				this.targetIsInput(event)) {
				return; // Ignore if still touching with one or more fingers or input
			}

			let touchEndClientX;
			let touchEndClientY;

			if (window.navigator.msPointerEnabled) {
				touchEndClientX = event.pageX;
				touchEndClientY = event.pageY;
			} else {
				touchEndClientX = event.changedTouches[0].clientX;
				touchEndClientY = event.changedTouches[0].clientY;
			}

			const dx = touchEndClientX - touchStartClientX;
			const absDx = Math.abs(dx);

			const dy = touchEndClientY - touchStartClientY;
			const absDy = Math.abs(dy);

			if (Math.max(absDx, absDy) > 10) {
				// (right : left) : (down : up)
				this.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
			}
		});
	}
	restart(event) {
		event.preventDefault();
		this.emit("restart");
	}
	keepPlaying(event) {
		event.preventDefault();
		this.emit("keepPlaying");
	}
	bindButtonPress(selector, fn) {
		const button = document.querySelector(selector);
		button.addEventListener("click", fn.bind(this));
		button.addEventListener(this.eventTouchend, fn.bind(this));
	}
	targetIsInput(event) { return event.target.tagName.toLowerCase() === "input"; }
}

class HTMLActuator {
	constructor() {
		this.tileContainer = document.querySelector(".tile-container");
		this.scoreContainer = document.querySelector(".score-container");
		this.bestContainer = document.querySelector(".best-container");
		this.messageContainer = document.querySelector(".game-message");
		this.sharingContainer = document.querySelector(".score-sharing");

		this.score = 0;
	}
	actuate(grid, metadata) {
		window.requestAnimationFrame(() => {
			this.clearContainer(this.tileContainer);

			grid.cells.forEach((column) => {
				column.forEach((cell) => {
					if (cell) {
						this.addTile(cell);
					}
				});
			});

			this.updateScore(metadata.score);
			this.updateBestScore(metadata.bestScore);

			if (metadata.terminated) {
				if (metadata.over) {
					this.message(false); // You lose
				} else if (metadata.won) {
					this.message(true); // You win!
				}
			}
		});
	}
	// Continues the game (both restart and keep playing)
	continueGame() {
		if (typeof ga !== "undefined") {
			ga("send", "event", "game", "restart");
		}

		this.clearMessage();
	}
	clearContainer(container) {
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}
	}
	//                                   2     4    8     16       32       64        128       256        512          1024           2048
	addTile(tile) {
		const wrapper = document.createElement("div");
		const inner = document.createElement("div");
		const position = tile.previousPosition || { x: tile.x, y: tile.y };
		const positionClass = this.positionClass(position);

		// We can't use classlist because it somehow glitches when replacing classes
		const classes = ["tile", `tile-${tile.value}`, positionClass];

		if (tile.value > 2048) classes.push("tile-super");

		this.applyClasses(wrapper, classes);

		inner.classList.add("tile-inner");
		inner.textContent =
			HTMLActuator.prototype.tileHTML[Math.log(tile.value) / Math.LN2 - 1] ||
			tile.value;

		if (tile.previousPosition) {
			// Make sure that the tile gets rendered in the previous position first
			window.requestAnimationFrame(() => {
				classes[2] = this.positionClass({ x: tile.x, y: tile.y });
				this.applyClasses(wrapper, classes); // Update the position
			});
		} else if (tile.mergedFrom) {
			classes.push("tile-merged");
			this.applyClasses(wrapper, classes);

			// Render the tiles that merged
			tile.mergedFrom.forEach((merged) => {
				this.addTile(merged);
			});
		} else {
			classes.push("tile-new");
			this.applyClasses(wrapper, classes);
		}

		// Add the inner part of the tile to the wrapper
		wrapper.appendChild(inner);

		// Put the tile on the board
		this.tileContainer.appendChild(wrapper);
	}
	applyClasses(element, classes) {
		element.setAttribute("class", classes.join(" "));
	}
	normalizePosition(position) {
		return ({
			x: position.x + 1,
			y: position.y + 1,
		});
	}
	positionClass(position) {
		position = this.normalizePosition(position);
		return `tile-position-${position.x}-${position.y}`;
	}
	updateScore(score) {
		this.clearContainer(this.scoreContainer);

		const difference = score - this.score;
		this.score = score;

		this.scoreContainer.textContent = this.score;

		if (difference > 0) {
			const addition = document.createElement("div");
			addition.classList.add("score-addition");
			addition.textContent = `+${difference}`;

			this.scoreContainer.appendChild(addition);
		}
	}
	updateBestScore(bestScore) {
		this.bestContainer.textContent = bestScore;
	}
	message(won) {
		const type = won ? "game-won" : "game-over";
		const message = won ? "You win!" : "Game over!";

		if (typeof ga !== "undefined") {
			ga("send", "event", "game", "end", type, this.score);
		}

		this.messageContainer.classList.add(type);
		this.messageContainer.getElementsByTagName("p")[0].textContent = message;

		this.clearContainer(this.sharingContainer);
		this.sharingContainer.appendChild(this.scoreTweetButton());
		//twttr.widgets.load();
	}
	clearMessage() {
		// IE only takes one value to remove at a time.
		this.messageContainer.classList.remove("game-won");
		this.messageContainer.classList.remove("game-over");
	}
	scoreTweetButton() {
		const tweet = document.createElement("a");
		tweet.classList.add("twitter-share-button");
		tweet.setAttribute("href", "https://twitter.com/share");
		tweet.setAttribute("data-via", "gabrielecirulli");
		tweet.setAttribute("data-url", "http://git.io/2048");
		tweet.setAttribute("data-counturl", "http://gabrielecirulli.github.io/2048/");
		tweet.textContent = "分享";

		const text = `I scored ${this.score} points at 2048, a game where you join numbers to score high! #2048game`;
		tweet.setAttribute("data-text", text);

		return tweet;
	}
}

//HTMLActuator.prototype.tileHTML = ["菜鸟", "入门", "码畜", "码奴", "码农", "IT民工", "IT工程师", "IT人才", "IT精英", "IT大哥", "IT领袖"];
//HTMLActuator.prototype.tileHTML = ["2", "4", "8", "16", "32", "64", "128", "256", "512", "1024", "2048"];
//HTMLActuator.prototype.tileHTML = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "win"];
//HTMLActuator.prototype.tileHTML = ["工兵", "班长", "排长", "连长", "营长", "团长", "旅长", "师长", "军长", "司令", "军旗"];
HTMLActuator.prototype.tileHTML = [
	"啊",
	"死",
	"冰",
	"卧操",
	"击败",
	"Allin",
	"说的道理",
	"哈比下",
	"奥利安费",
	"哈利路大旋风",
	"口圭 衤夭",
];

class Grid {
	constructor(size, previousState) {
		this.size = size;
		this.cells = previousState ? this.fromState(previousState) : this.empty();
	}
	// Build a grid of the specified size
	empty() {
		const cells = [];

		for (let x = 0; x < this.size; x++) {
			const row = (cells[x] = []);

			for (let y = 0; y < this.size; y++) {
				row.push(null);
			}
		}

		return cells;
	}
	fromState(state) {
		const cells = [];

		for (let x = 0; x < this.size; x++) {
			const row = (cells[x] = []);

			for (let y = 0; y < this.size; y++) {
				const tile = state[x][y];
				row.push(tile ? new Tile(tile.position, tile.value) : null);
			}
		}

		return cells;
	}
	// Find the first available random position
	randomAvailableCell() {
		const cells = this.availableCells();

		if (cells.length) {
			return cells[Math.floor(Math.random() * cells.length)];
		}
	}
	availableCells() {
		const cells = [];

		this.eachCell((x, y, tile) => {
			if (!tile) {
				cells.push({ x: x, y: y });
			}
		});

		return cells;
	}
	// Call callback for every cell
	eachCell(callback) {
		for (let x = 0; x < this.size; x++) {
			for (let y = 0; y < this.size; y++) {
				callback(x, y, this.cells[x][y]);
			}
		}
	}
	// Check if there are any cells available
	cellsAvailable() {
		return !!this.availableCells().length;
	}
	// Check if the specified cell is taken
	cellAvailable(cell) {
		return !this.cellOccupied(cell);
	}
	cellOccupied(cell) {
		return !!this.cellContent(cell);
	}
	cellContent(cell) {
		if (this.withinBounds(cell)) {
			return this.cells[cell.x][cell.y];
		}
		return null;
	}
	// Inserts a tile at its position
	insertTile(tile) {
		this.cells[tile.x][tile.y] = tile;
	}
	removeTile(tile) {
		this.cells[tile.x][tile.y] = null;
	}
	withinBounds(position) {
		return (
			position.x >= 0 &&
			position.x < this.size &&
			position.y >= 0 &&
			position.y < this.size
		);
	}
	serialize() {
		const cellState = [];

		for (let x = 0; x < this.size; x++) {
			const row = (cellState[x] = []);

			for (let y = 0; y < this.size; y++) {
				row.push(this.cells[x][y] ? this.cells[x][y].serialize() : null);
			}
		}

		return {
			size: this.size,
			cells: cellState,
		};
	}
}

class Tile {
	constructor(position, value) {
		this.x = position.x;
		this.y = position.y;
		this.value = value || 2;

		this.previousPosition = null;
		this.mergedFrom = null; // Tracks tiles that merged together
	}
	savePosition() {
		this.previousPosition = { x: this.x, y: this.y };
	}
	updatePosition(position) {
		this.x = position.x;
		this.y = position.y;
	}
	serialize() {
		return {
			position: {
				x: this.x,
				y: this.y,
			},
			value: this.value,
		};
	}
}



window.fakeStorage = {
	_data: {},

	setItem: function (id, val) {
		return (this._data[id] = String(val));
	},

	getItem: function (id) {
		return this._data.hasOwnProperty(id) ? this._data[id] : undefined;
	},

	removeItem: function (id) {
		return delete this._data[id];
	},

	clear: function () {
		return (this._data = {});
	},
};

class LocalStorageManager {
	constructor() {
		this.bestScoreKey = "bestScore";
		this.gameStateKey = "gameState";

		const supported = this.localStorageSupported();
		this.storage = supported ? window.localStorage : window.fakeStorage;
	}
	localStorageSupported() {
		const testKey = "test";
		const storage = window.localStorage;

		try {
			storage.setItem(testKey, "1");
			storage.removeItem(testKey);
			return true;
		} catch (error) {
			return false;
		}
	}
	// Best score getters/setters
	getBestScore() {
		return this.storage.getItem(this.bestScoreKey) || 0;
	}
	setBestScore(score) {
		this.storage.setItem(this.bestScoreKey, score);
	}
	// Game state getters/setters and clearing
	getGameState() {
		const stateJSON = this.storage.getItem(this.gameStateKey);
		return stateJSON ? JSON.parse(stateJSON) : null;
	}
	setGameState(gameState) {
		this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
	}
	clearGameState() {
		this.storage.removeItem(this.gameStateKey);
	}
}

class GameManager {
	constructor(size, InputManager, Actuator, StorageManager) {
		this.size = size; // Size of the grid
		this.inputManager = new InputManager();
		this.storageManager = new StorageManager();
		this.actuator = new Actuator();

		this.startTiles = 2;

		this.inputManager.on("move", this.move.bind(this));
		this.inputManager.on("restart", this.restart.bind(this));
		this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

		this.setup();
	}
	// Restart the game
	restart() {
		this.storageManager.clearGameState();
		this.actuator.continueGame(); // Clear the game won/lost message
		this.setup();
	}
	// Keep playing after winning (allows going over 2048)
	keepPlaying() {
		this.keepPlaying = true;
		this.actuator.continueGame(); // Clear the game won/lost message
	}
	// Return true if the game is lost, or has won and the user hasn't kept playing
	isGameTerminated() {
		if (this.over || (this.won && !this.keepPlaying)) {
			return true;
		}
		return false;
	}
	// Set up the game
	setup() {
		const previousState = this.storageManager.getGameState();

		// Reload the game from a previous game if present
		if (previousState) {
			this.grid = new Grid(previousState.grid.size, previousState.grid.cells); // Reload grid
			this.score = previousState.score;
			this.over = previousState.over;
			this.won = previousState.won;
			this.keepPlaying = previousState.keepPlaying;
		} else {
			this.grid = new Grid(this.size);
			this.score = 0;
			this.over = false;
			this.won = false;
			this.keepPlaying = false;

			// Add the initial tiles
			this.addStartTiles();
		}

		// Update the actuator
		this.actuate();
	}
	// Set up the initial tiles to start the game with
	addStartTiles() {
		for (let i = 0; i < this.startTiles; i++) {
			this.addRandomTile();
		}
	}
	// Adds a tile in a random position
	addRandomTile() {
		if (this.grid.cellsAvailable()) {
			const value = Math.random() < 0.9 ? 2 : 4; //0.1几率出4
			const tile = new Tile(this.grid.randomAvailableCell(), value);

			this.grid.insertTile(tile);
		}
	}
	// Sends the updated grid to the actuator
	actuate() {
		if (this.storageManager.getBestScore() < this.score) {
			this.storageManager.setBestScore(this.score);
		}

		// Clear the state when the game is over (game over only, not win)
		if (this.over) {
			this.storageManager.clearGameState();
		} else {
			this.storageManager.setGameState(this.serialize());
		}

		this.actuator.actuate(this.grid, {
			score: this.score,
			over: this.over,
			won: this.won,
			bestScore: this.storageManager.getBestScore(),
			terminated: this.isGameTerminated(),
		});
	}
	// Represent the current game as an object
	serialize() {
		return {
			grid: this.grid.serialize(),
			score: this.score,
			over: this.over,
			won: this.won,
			keepPlaying: this.keepPlaying,
		};
	}
	// Save all tile positions and remove merger info
	prepareTiles() {
		this.grid.eachCell((x, y, tile) => {
			if (tile) {
				tile.mergedFrom = null;
				tile.savePosition();
			}
		});
	}
	// Move a tile and its representation
	moveTile(tile, cell) {
		this.grid.cells[tile.x][tile.y] = null;
		this.grid.cells[cell.x][cell.y] = tile;
		tile.updatePosition(cell);
	}
	// Move tiles on the grid in the specified direction
	PlaySound(musicId) {
		const music = document.getElementById(musicId);
		console.log(music);
		console.log(music.paused);
		music.play();
		if (music.paused) {
			music.paused = false;
		}
	}
	PlaySound2(musicId) {
		const music = document.getElementById(musicId);
		console.log(music);
		console.log(music.paused);
		music.play();
		if (music.paused) {
			music.paused = false;
		}
	}
	PlaySound3(musicId) {
		const music = document.getElementById(musicId);
		console.log(music);
		console.log(music.paused);
		music.play();
		if (music.paused) {
			music.paused = false;
		}
	}
	move(direction) {
		if (this.isGameTerminated()) return; // Don't do anything if the game's over

		let cell;
		let tile;

		const vector = this.getVector(direction);
		const traversals = this.buildTraversals(vector);
		let moved = false;

		// Save the current tile positions and remove merger information
		this.prepareTiles();

		// Traverse the grid in the right direction and move tiles
		traversals.x.forEach((x) => {
			traversals.y.forEach((y) => {
				cell = { x: x, y: y };
				tile = this.grid.cellContent(cell);

				if (tile) {
					const positions = this.findFarthestPosition(cell, vector);
					const next = this.grid.cellContent(positions.next);

					// Only one merger per row traversal?
					if (next && next.value === tile.value && !next.mergedFrom) {
						const merged = new Tile(positions.next, tile.value * 2);
						merged.mergedFrom = [tile, next];

						this.grid.insertTile(merged);
						this.grid.removeTile(tile);

						if (tile.value === 2) {
							//有数字为4的方块被合成
							//self.PlaySound("Play2");
							const srcs = [
								"./audio/4/1.wav",
								"./audio/4/2.wav",
								"./audio/4/3.wav",
								"./audio/4/4.wav",
								"./audio/4/5.wav",
								"./audio/4/6.wav",
							];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}
						if (tile.value === 4) {
							//有数字为8的方块被合成
							//self.PlaySound("Play3");
							const srcs = [
								"./audio/8/1.wav",
								"./audio/8/2.wav",
								"./audio/8/3.wav",
								"./audio/8/4.wav",
								"./audio/8/5.wav",
								"./audio/8/6.wav",
							];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}

						if (tile.value === 8) {
							//有数字为16的方块被合成
							const srcs = [
								"./audio/16/1.wav",
								"./audio/16/2.wav",
								"./audio/16/3.wav",
								"./audio/16/4.wav",
								"./audio/16/5.wav",
								"./audio/16/6.wav",
							];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}

						if (tile.value === 16) {
							//有数字为32的方块被合成
							const srcs = ["./audio/32/1.wav"];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}

						if (tile.value === 32) {
							//有数字为64的方块被合成
							const srcs = [
								"./audio/64/1.wav",
								"./audio/64/2.wav",
								"./audio/64/3.wav",
							];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}

						if (tile.value === 64) {
							//有数字为128的方块被合成
							const srcs = [
								"./audio/128/1.wav",
								"./audio/128/2.wav",
								"./audio/128/3.wav",
							];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
						}
						if (tile.value === 128) {
							//有数字为256的方块被合成
							const srcs = ["./audio/256/1.wav"];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
							
						}
						if (tile.value === 256) {
							//有数字为512的方块被合成
							const srcs = ["./audio/512/1.wav", "./audio/512/2.wav"];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
							
						}
						if (tile.value === 512) {
							//有数字为1024的方块被合成
							const srcs = ["./audio/1024/1.wav"];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
							
						}
						if (tile.value === 1024) {
							//哇袄！！！！！
							const srcs = ["./audio/2048/1.wav"];
							const audioFile = getRandomItem(srcs);
							playAudio(audioFile);
							
						}
						// Converge the two tiles' positions
						tile.updatePosition(positions.next);

						// Update the score
						this.score += merged.value;

						// The mighty 2048 tile
						if (merged.value === 2048) {
							this.won = true;
							const audioFile = "./audio/win/1.wav";
							playAudio(audioFile, 1);
							const dom = document.getElementById("luigi-modal");
							if (dom) {
								dom.style.display = "block";
								setTimeout(() => {
									dom.style.display = "none";
								}, 3000);
							}
						}
					} else {
						this.moveTile(tile, positions.farthest);
					}

					if (!this.positionsEqual(cell, tile)) {
						moved = true; // The tile moved from its original cell!
					}
				}
			});
		});

		if (moved) {
			//按下了上下左右中的一个按键，画面变动，调用audio/success/*.mp3中的随机一个
			this.addRandomTile();
			const srcs = [
				"./audio/success/1.wav",
				"./audio/success/2.wav",
				"./audio/success/3.wav",
				"./audio/success/4.wav",
				"./audio/success/5.wav",
				"./audio/success/6.wav",
				"./audio/success/7.wav",
				"./audio/success/8.wav",
				"./audio/success/9.wav",
				"./audio/success/10.wav",
				"./audio/success/11.wav",
				"./audio/success/12.wav",
				"./audio/success/13.wav",
				"./audio/success/14.wav",
				"./audio/success/15.wav",
				"./audio/success/16.wav",
				"./audio/success/17.wav",
				"./audio/success/18.wav",
				"./audio/success/19.wav",
				"./audio/success/20.wav",
				"./audio/success/21.wav",
				"./audio/success/22.wav",
				"./audio/success/23.wav",
				"./audio/success/24.wav",
				"./audio/success/25.wav",
				"./audio/success/26.wav",
			];
			const audioFile = getRandomItem(srcs);
			playAudio(audioFile);
			// luig-修改点-3-播放阴乐-over
			if (!this.movesAvailable()) {
				const audioFile = "./audio/win/2.wav";
				playAudio(audioFile, 1);
				this.over = true; // Game over!
			}

			this.actuate();
		} else {
			//按下了上下左右中的一个按键，但是画面不变动，调用audio/failed/*.mp3中的随机一个
			const srcs = [
				"./audio/failed/1.wav",
				"./audio/failed/2.wav",
				"./audio/failed/3.wav",
				"./audio/failed/4.wav",
				"./audio/failed/5.wav",
				"./audio/failed/6.wav",
				"./audio/failed/7.wav",
				"./audio/failed/8.wav",
				"./audio/failed/9.wav",
				"./audio/failed/10.wav",
				"./audio/failed/11.wav",
			];
			const audioFile = getRandomItem(srcs);
			playAudio(audioFile);
		}
	}
	// Get the vector representing the chosen direction
	getVector(direction) {
		// Vectors representing tile movement
		const map = {
			0: { x: 0, y: -1 }, // Up
			1: { x: 1, y: 0 }, // Right
			2: { x: 0, y: 1 }, // Down
			3: { x: -1, y: 0 }, // Left
		};

		return map[direction];
	}
	// Build a list of positions to traverse in the right order
	buildTraversals(vector) {
		const traversals = { x: [], y: [] };

		for (let pos = 0; pos < this.size; pos++) {
			traversals.x.push(pos);
			traversals.y.push(pos);
		}

		// Always traverse from the farthest cell in the chosen direction
		if (vector.x === 1) traversals.x = traversals.x.reverse();
		if (vector.y === 1) traversals.y = traversals.y.reverse();

		return traversals;
	}
	findFarthestPosition(cell, vector) {
		let previous;

		// Progress towards the vector direction until an obstacle is found
		do {
			previous = cell;
			cell = { x: previous.x + vector.x, y: previous.y + vector.y };
		} while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

		return {
			farthest: previous,
			next: cell, // Used to check if a merge is required
		};
	}
	movesAvailable() {
		return this.grid.cellsAvailable() || this.tileMatchesAvailable();
	}
	// Check for available matches between tiles (more expensive check)
	tileMatchesAvailable() {
		let tile;

		for (let x = 0; x < this.size; x++) {
			for (let y = 0; y < this.size; y++) {
				tile = this.grid.cellContent({ x: x, y: y });

				if (tile) {
					for (let direction = 0; direction < 4; direction++) {
						const vector = this.getVector(direction);
						const cell = { x: x + vector.x, y: y + vector.y };

						const other = this.grid.cellContent(cell);
						if (other && other.value === tile.value) {
							return true; // These two tiles can be merged
						}
					}
				}
			}
		}

		return false;
	}
	positionsEqual(first, second) { return first.x === second.x && first.y === second.y; }
}

// Wait till the browser is ready to render the game (avoids glitches)
window.requestAnimationFrame(() => {
	new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
});
