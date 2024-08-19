var lang = "en";
var translation = false;
var libraryCache, collectionCache, bookCache, partCache, noteCache;
var curCollection, curBook, curPart, curChapter;
var contentTouch = readerTouch = modalTouch = {};

function mode(b) {
	if (b) {
		document.body.setAttribute("data-theme", b);
	}
}
function modeHandler(e) {
	var storedTheme = localStorage.getItem("theme") || (e.matches ? "dark" : "light");
	mode(storedTheme);
}
var modeMQ = window.matchMedia("(prefers-color-scheme: dark)");
if (modeMQ.addEventListener) {
	modeMQ.addEventListener("change", modeHandler);
} else {
	modeMQ.addListener(modeHandler);
}
if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
	mode("dark");
}
mode(localStorage.getItem("theme"));

var short = false;
function shortHandler(e) {
	short = e.matches ? true : false;
}
var shortMQ = window.matchMedia("(max-width: 400px)");
if (shortMQ.addEventListener) {
	shortMQ.addEventListener("change", shortHandler);
} else {
	shortMQ.addListener(shortHandler);
}
if (window.matchMedia && window.matchMedia("(max-width: 400px)").matches) {
	short = true;
}

libCatalog();

function readBinaryFile(file, callback) {
	var xhr = new XMLHttpRequest();
	xhr.responseType = "arraybuffer";
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () {
		if (xhr.status >= 200 && xhr.status < 300) {
			try {
				callback(true, msgpackr.unpack(xhr.response));
			} catch (e) {
				callback(false, true);
			}
		} else {
			callback(false);
		}
	});
	xhr.send(null);
}
function readFile(file, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () {
		if (xhr.status >= 200 && xhr.status < 300) {
			callback(true, xhr.responseText);
		} else {
			callback(false);
		}
	});
	xhr.send(null);
}
function readLines(file, lineNumbers, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () {
		if (xhr.status >= 200 && xhr.status < 300) {
			var lines = xhr.responseText.replace(/\n\n/g, "\n").replace(/~([^\^]+)\/\^/g, "").replace(/\^/g, "").split("\n");
			callback(true, lineNumbers.map(function (line) { return lines[line - 1] }));
		} else {
			callback(false);
		}
	});
	xhr.send(null);
}
function ordinal(n) { // georg @ https://stackoverflow.com/a/8241071
	var ordA = "a".charCodeAt(0);
	var len = "z".charCodeAt(0) - ordA + 1;
	var s = "";
	while (n >= 0) {
		s = String.fromCharCode(n % len + ordA) + s;
		n = Math.floor(n / len) - 1;
	}
	return s;
}
function integer(s) {
	var ordA = "a".charCodeAt(0);
	var len = "z".charCodeAt(0) - ordA + 1;
	var n = 0;
	for (var i = 0; i < s.length; i++) {
		var charCode = s.charCodeAt(i) - ordA;
		n = n * len + charCode;
	}
	return n;
}
function parse(el, type, text) {
	if (type = "verse") {
		var v = 1; // Verse number
		for (var line of text.split(/\n(?![^\^]*\/\^)/g)) { // Preserve translation group newlines
			if (line != "") {
				var item = document.createElement("li");
				item.id = "p" + v;
				var n = 0; // Note number
				while (match = /<\|([^>]+)>/g.exec(line)) { // Preserve grouped clarity
					line = line.replace(match[0], "`|" + match[1] + "`");
				}
				var newLine = line;
				while (match = /(?:<([^>]+)>)|(?:\^([^\^]+)\/\^)/g.exec(line)) { // Either < > or ^ /^
					var ord = ordinal(n);
					var sup = "<sup>" + ord + "</sup>";
					if (match[2]) { // Translation
						var subCount = 0; // Contained notes
						var newSubline = match[2];
						while (submatch = /<([^>]+)>/g.exec(match[2])) { // Mini verse Parse()
							if (match[2].split("~")[0].startsWith("<")) { // Special Case: If translation begins with a note, then combine notes to avoid superimposition
								newSubline = newSubline.replace(submatch[0], submatch[1]);
								match[2] = match[2].replace(submatch[0], "");
							}
							++subCount;
							ord = ordinal(n + subCount);
							sup = "<sup>" + ord + "</sup>";
							if (submatch[1].startsWith("|")) { // Clarity
								--subCount;
								newSubline = newSubline.replace(submatch[0], "<em>" + submatch[1].slice(1) + "</em>");
							} else {
								newSubline = newSubline.replace(submatch[0], '<span id="n' + v + ord + '" onclick="note(this)">' + sup + submatch[1] + "</span>");
							}
							match[2] = match[2].replace(submatch[0], "");
						}
						ord = ordinal(n);
						sup = "<sup>" + ord + "</sup>";
						var t = newSubline.split("~")[0];
						var originalLen = t.split("\n").length;
						if (translation) {
							t = newSubline.split("~")[1];
							var translationLen = t.split("\n").length;
						}
						while (emMatch = /`([^\|]+?)`/g.exec(t)) { // Emphasize ` `, but not `| `
							t = t.replace(emMatch[0], '<em class="jst">' + emMatch[1] + "</em>");
						}
						var first = true;
						var u = 0; // Contained verse number
						for (var verse of t.split("\n")) {
							++u;
							if (!first) { // First verse is the container
								if (u <= originalLen) {
									t = t.replace(verse, '<li id="p' + (v + u - 1) + '"><span>' + verse + "</span></li>");
								} else {
									t = t.replace(verse, "<li><span>" + verse + "</span></li>");
								}
								n = 0;
							} else {
								first = false;
							}
							var f = true;
							var offset = 0; // Sub-verse note offset
							var count = 1; // Sub-verse note count
							var subVerse = verse;
							var tmp = verse;
							while (idMatch = /( id="n)[0-9]*?([a-z]*?)(" onclick="note\(this\)"><sup>)[a-z]*?(<\/sup>)/g.exec(tmp)) { // Capture ids
								++count;
								if (f) {
									f = false;
									offset = integer(idMatch[2]);
								}
								var net = count - offset;
								if (net < 0) {
									net = 0;
								}
								var o = ordinal(net);
								subVerse = subVerse.replace(idMatch[0], idMatch[1] + (v + u - 1) + o + idMatch[3] + o + idMatch[4]);
								tmp = tmp.replace(idMatch[0], "");
							}
							t = t.replace(verse, subVerse);
						}
						ord = ordinal(n);
						sup = "<sup>" + ord + "</sup>";
						if (translation) {
							newLine = newLine.replace(match[0], '<span id="n' + v + ord + '">' + sup + t + "</span>");
						} else {
							t = t.split(/ (?![^<]*>)/g); // Preserve HTML tags
							var html = '<span id="n' + v + ord + '" onclick="note(this)">' + sup + t[0] + "</span>";
							t[0] = "";
							newLine = newLine.replace(match[0], html + t.join(" "));
						}
						n = n + subCount; // Add contained notes
						item.id = "p" + v; // I don't know why this works
						v = v + u - 1; // Reset verse number for following verses
						if (translation) {
							v = v - (translationLen - originalLen);
						}
					} else {
						newLine = newLine.replace(match[0], '<span id="n' + v + ord + '" onclick="note(this)">' + sup + match[1] + "</span>");
					}
					line = line.replace(match[0], "");
					++n;
				}
				while (match = /`\|([^`]+)`/g.exec(newLine)) { // Convert preserved clarity
					newLine = newLine.replace(match[0], "<em>" + match[1] + "</em>");
				}
				item.innerHTML = newLine;
				el.appendChild(item);
				v++;
			} else {
				el.appendChild(document.createElement("br"));
			}
		}
	}
}

var back = document.getElementById("back");
var backLabel = document.getElementById("back-label");
var title = document.getElementById("title");
var pages = document.getElementById("content").children;
var tabs = document.getElementById("nav").children;
var alertInfo = document.getElementById("alert-info");
var alertBtns = document.getElementById("alert-btns");
function notify(type, msg, info, buttons) {
	document.getElementById("alert-title").textContent = msg;
	switch (info) {
		case "":
			alertInfo.style.display = "none";
			alertInfo.textContent = "";
			break;
		default:
			alertInfo.textContent = info;
			alertInfo.style.display = "";
	}
	alertBtns.innerHTML = "";
	for (var b in buttons) {
		var btn = document.createElement("button");
		btn.textContent = b;
		var action = buttons[b];
		if (!action) { // Default action
			action = function () { document.body.classList.remove("alert") };
		}
		btn.addEventListener("click", action);
		alertBtns.appendChild(btn);
	}
	document.body.classList.add("alert");
}
function swap(el, txt, timing) {
	el.classList.add("swapping");
	setTimeout(function () {
		el.textContent = txt;
		el.classList.remove("swapping");
	}, timing * 500);
}
function setBack(action, label, hide) {
	hide = hide || "";
	if (hide == "button") {
		back.style.opacity = "0";
	}
	back.onclick = action;
	swap(backLabel, label, .35);
	if (hide == "") {
		back.style.opacity = "";
	}
}
function closeInspector(e) {
	if (e && !e.target.closest("#inspector, #back")) {
		document.getElementById("content").removeEventListener("click", closeInspector);
		back.click();
	} else if (!e) {
		document.getElementById("content").removeEventListener("click", closeInspector);
	}
}
function slide(page, tab, data, load) {
	load = load != undefined ? load : true;
	if (!tab) { // No active tab
		for (var i = 0; i < tabs.length; i++) {
			tabs[i].classList.remove("active");
		}
	} else { // Active tab
		for (var i = 0; i < tabs.length; i++) {
			if (tabs[i].id == tab + "-tab") {
				tabs[i].classList.add("active");
			} else {
				tabs[i].classList.remove("active");
			}
		}
	}
	var x = true;
	for (var i = 0; i < pages.length; i++) {
		if (pages[i].id == page) { // Should page be slid
			x = false;
		}
		if (x) {
			pages[i].classList.add("hidden");
		} else {
			pages[i].classList.remove("hidden");
		}
	}
	switch (page) {
		case "home":
			setBack(function () {}, "", "button");
			document.title = "Sprym";
			swap(title, "Home", .35);
			break;
		case "library":
			setBack(function () { slide("home", "home") }, "");
			document.title = "Library";
			swap(title, "Library", .35);
			break;
		case "collection":
			setBack(function () { slide("library", "lib") }, "Library");
			document.title = data.name || "Collection";
			swap(title, data.name || "Collection", .35);
			curCollection = data;
			if (load) {
				collectionCatalog();
			}
			break;
		case "book":
			if (short) {
				var ccs = curCollection.short;
			}
			setBack(function () { slide("collection", "lib", curCollection, false) }, ccs || curCollection.name);
			document.title = data.name || "Book";
			swap(title, data.name || "Book", .35);
			curBook = data;
			curPart = { "id": "SKIP" };
			if (load) {
				bookCatalog();
			}
			break;
		case "part":
			setBack(function () { slide("book", null, curBook, false) }, curBook.short || curBook.name);
			document.title = data.name || "Part";
			swap(title, data.name || "Part", .35);
			curPart = data;
			if (load) {
				partCatalog();
			}
			break;
		case "reader":
			var label = data.name;
			var pLabel = "";
			if (short) {
				var cps = curPart.short;
			}
			if (curPart.id == "SKIP") { // If part skipped
				pLabel = curBook.short || curBook.name;
			} else {
				pLabel = cps || curPart.name;
			}
			if (data.short) {
				label = curPart.name + " " + data.short;
				pLabel = "";
			}
			if (curPart.id == "SKIP") { // If part skipped
				setBack(function () { slide("book", null, curBook, false) }, pLabel);
			} else {
				setBack(function () { slide("part", null, curPart, false) }, pLabel);
			}
			document.title = label;
			swap(title, label || "Chapter", .35);
			curChapter = data;
			if (load) {
				chapterCatalog(data.id);
			}
			break;
		case "inspector":
			setTimeout(function () {
				document.getElementById("content").addEventListener("click", closeInspector);
			}, 0);
			var label = curChapter.name;
			if (curChapter.short) {
				label = (curPart.short || curPart.name) + " " + curChapter.short;
			}
			setBack(function () {
				closeInspector();
				slide("reader", null, curChapter, false);
			}, label);
			swap(title, data || "Inspector", .35);
			break;
		default:
			document.title = "Sprym";
			swap(title, "Sprym", .35);
	}
}

function libCatalog() { // Get collections
	readBinaryFile("library/" + lang + "/library.scl", function (success, library) {
		var el = document.getElementById("collections");
		if (success) {
			el.innerHTML = "";
			for (var collection of library) {
				var item = document.createElement("li");
				var img = document.createElement("img");
				img.loading = "lazy";
				img.src = "library/" + collection.id + ".jpg";
				img.addEventListener("error", function () {
					this.src = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"; // Valid empty image fallback
				});
				var label = document.createElement("p");
				label.textContent = collection.name;
				(function () {
					var c = collection;
					item.addEventListener("click", function () {
						slide("collection", "lib", c, document.getElementById("books").innerHTML == "" || (curCollection && c.id != curCollection.id)); // Load books the first time, then if different collection
					});
				})();
				item.append(img, label);
				el.appendChild(item);
			}
			libraryCache = library;
		} else { // Create error page
			var err = document.createElement("div");
			var msg = document.createElement("h2");
			err.id = "error";
			msg.textContent = "Unable to Load Library";
			if (!library) {
				var action = document.createElement("button");
				action.textContent = "Try Again";
				action.id = "action"; // For adding click listener
				err.append(msg, action);
			} else {
				err.appendChild(msg);
			}
			el.innerHTML = err.outerHTML;
			if (!library) {
				document.getElementById("action").addEventListener("click", function () {
					libCatalog();
					slide("library", "lib");
				});
				setTimeout(function () {
					document.getElementById("lib-btn").addEventListener("click", function () {
						this.removeEventListener("click", arguments.callee);
						libCatalog();
					});
				}, 0);
			}
		}
	});
}
function collectionCatalog() { // Get books
	var booklist;
	for (var collection of libraryCache) { // Search for selected collection
		if (collection.id == curCollection.id) {
			booklist = collection.books;
			break;
		}
	}
	if (booklist && booklist.length > 0) { // If found
		var el = document.getElementById("books");
		while (el.firstChild) { // Clear books
			el.removeChild(el.lastChild);
		}
		for (var bookID of booklist) {
			var item = document.createElement("li");
			var img = document.createElement("img");
			var label = document.createElement("p");
			img.loading = "lazy";
			img.src = "library/" + lang + "/" + bookID + ".spr/cover.jpg";
			img.addEventListener("error", function () {
				this.src = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"; // Valid empty image fallback
			});
			item.appendChild(img);
			(function () {
				var bID = bookID;
				var i = item;
				var l = label;
				readBinaryFile("library/" + lang + "/" + bookID + ".spr/book.stc", function (success, book) {
					if (success) {
						l.textContent = book.name;
						i.addEventListener("click", function () {
							slide("book", null, book, document.getElementById("parts").innerHTML == "" || bID != curBook.id); // Load parts the first time, then if different book
						});
						i.appendChild(l);
					} else {
						el.removeChild(i); // Remove from display
					}
				});
			})();
			el.appendChild(item);
		}
		collectionCache = booklist;
	} else {
		curCollection = null;
		back.click();
		notify("error", "No Books Found", "No books were found in this collection.", { "OK": null });
	}
}
function bookCatalog() { // Get parts
	var el = document.getElementById("parts");
	while (el.firstChild) { // Clear parts
		el.removeChild(el.lastChild);
	}
	var chapters = document.getElementById("chapters");
	while (chapters.firstChild) { // Clear chapters
		chapters.removeChild(chapters.lastChild);
	}
	var article = document.getElementById("article");
	while (article.firstChild) { // Clear article
		article.removeChild(article.lastChild);
	}
	noteCache = null; // Clear notes
	readBinaryFile("library/" + lang + "/" + curBook.id + ".spr/book.stc", function (success, book) {
		if (success) {
			if (book.parts && book.parts.length > 0) { // If found
				for (var part of book.parts) {
					var item = document.createElement("li");
					var label = document.createElement("p");
					label.textContent = part.name;
					(function () {
						var p = part;
						if (p.skip == true) {
							item.classList.add("chapter");
							item.addEventListener("click", function () {
								slide("reader", null, p);
							});
						} else {
							item.addEventListener("click", function () {
								slide("part", null, p, document.getElementById("chapters").innerHTML == "" || p.id != (curPart.id || "")); // Load chapters the first time, then if different part
							});
						}
					})();
					item.appendChild(label);
					el.appendChild(item);
				}
				bookCache = book.parts;
			} else {
				back.click();
				notify("error", "Contents Not Found", "No content could be located in the table of contents.", { "OK": null });
			}
		} else {
			back.click();
			notify("error", "Unable to Load Contents", "The table of contents could not be loaded. Please check your network connection or try again later.", { "OK": null });
		}
	});
}
function partCatalog() { // Get chapters
	var chapters;
	var el = document.getElementById("chapters");
	for (var part of bookCache) { // Search for selected part
		if (part.id == curPart.id) {
			el.classList = part.type || "list";
			chapters = part.chapters;
			break;
		}
	}
	if (chapters && chapters.length > 0) { // If found
		while (el.firstChild) { // Clear chapters
			el.removeChild(el.lastChild);
		}
		var article = document.getElementById("article");
		while (article.firstChild) { // Clear article
			article.removeChild(article.lastChild);
		}
		noteCache = null; // Clear notes
		for (var chapter of chapters) {
			var item = document.createElement("li");
			var label = document.createElement("p");
			label.textContent = chapter.name;
			(function () {
				var c = chapter;
				item.addEventListener("click", function () {
					slide("reader", null, c, document.getElementById("article").innerHTML == "" || c.id != (curChapter.id || "")); // Load article if first load of part or if different chapter
				});
			})();
			item.appendChild(label);
			el.appendChild(item);
		}
		partCache = chapters;
	} else {
		back.click();
		notify("error", "No Chapters Found", "No chapters were found in this part.", { "OK": null });
	}
}
function chapterCatalog(id) { // Get article
	var article = document.getElementById("article");
	while (article.firstChild) { // Clear article
		article.removeChild(article.lastChild);
	}
	noteCache = null; // Clear notes
	if (id == "stp") {
		document.getElementById("head").style.display = "none";
		(function () {
			readBinaryFile("library/" + lang + "/" + curBook.id + ".spr/book.stp", function (success, titlePage) {
				if (success) {
					for (var paragraph of titlePage) {
						var p = document.createElement("p");
						p.classList.add("tp");
						if (paragraph.length == 1 && paragraph[0].type == "normal") { // A single "normal" item does not need a wrapper
							p.textContent = paragraph[0].content;
						} else {
							for (var x of paragraph) {
								switch (x.type) {
									case "title":
										var y = document.createElement("h2");
										break;
									case "heading":
										var y = document.createElement("h3");
										break;
									case "subheading":
										var y = document.createElement("h4");
										break;
									case "small":
										var y = document.createElement("small");
										break;
									default:
										var y = document.createElement("span");
								}
								y.textContent = x.content;
								p.appendChild(y);
							}
						}
						document.getElementById("article").appendChild(p);
					}
				}
			});
		})();
	} else if (curPart.id == "SKIP") {
		document.getElementById("head").style.display = "";
		document.getElementById("heading").textContent = curChapter.title || curChapter.name;
		document.getElementById("subheading").textContent = curChapter.subtitle || "";
		document.getElementById("intro").textContent = curChapter.intro || "";
		document.getElementById("superhead").style.display = "";
		(function () {
			var c = curChapter;
			readFile("library/" + lang + "/" + curBook.id + ".spr/" + curChapter.id + ".sch", function (success, x) {
				console.log(c, x);
			});
		})();
	} else {
		document.getElementById("head").style.display = "";
		for (var chapter of partCache) { // Search for selected chapter
			if (chapter.id == curChapter.id) {
				if (chapter == partCache[0]) { // Populate heading above first chapter
					document.getElementById("heading").textContent = curPart.title || "";
					document.getElementById("subheading").textContent = curPart.subtitle || "";
					document.getElementById("intro").textContent = curPart.intro || "";
					document.getElementById("superhead").style.display = "";
				} else {
					document.getElementById("superhead").style.display = "none";
				}
				document.getElementById("chapter").textContent = chapter.title || chapter.name;
				document.getElementById("summary").textContent = chapter.summary || "";
				(function () {
					readFile("library/" + lang + "/" + curBook.id + ".spr/" + curPart.id + "/" + curChapter.id + ".sch", function (success, contents) {
						if (success) {
							var body = document.createElement("ol");
							parse(body, "verse", contents);
							document.getElementById("article").appendChild(body);
						} else {
							notify("error", "Unable to Load Chapter", "The chapter could not be loaded. Please check your network connection or try again later.", { "OK": null });
						}
					});
				})();
			}
		}
	}
}

function parseNote(el, note) {
	if (note.note) {
		var item = document.createElement("li");
		item.textContent = note.note;
		el.appendChild(item);
	}
	if (note.ie) {
		var item = document.createElement("li");
		item.textContent = "IE " + note.ie;
		el.appendChild(item);
	}
	if (note.greek) {
		var item = document.createElement("li");
		item.textContent = "GR " + note.greek;
		el.appendChild(item);
	}
	if (note.jst) {
		var item = document.createElement("li");
		while (match = /`(.*?)`/g.exec(note.jst)) { // Emphasize ` `
			note.jst = note.jst.replace(match[0], "<em>" + match[1] + "</em>");
		}
		item.innerHTML = "JST " + note.jst;
		el.appendChild(item);
	}
	if (note.cross) {
		for (var n of note.cross) {
			var item = document.createElement("li");
			item.textContent = n;
			el.appendChild(item);
		}
	}
	if (note.tg) {
		for (var n of note.tg) {
			var item = document.createElement("li");
			item.textContent = "TG " + n;
			el.appendChild(item);
		}
	}
}
function note(link) {
	var id = link.id.slice(1);
	var t = "";
	for (var child of link.childNodes) { // Search for title label
		if (child.nodeType == Node.TEXT_NODE) {
			t = child.nodeValue;
			break;
		}
	}
	slide("inspector", null, id);
	document.getElementById("inspector-title").textContent = t;
	var element = document.getElementById("notes");
	while (element.firstChild) { // Clear notes
		element.removeChild(element.lastChild);
	}
	if (noteCache) {
		parseNote(element, noteCache[id]);
	} else {
		(function () {
			var el = element;
			var i = id;
			readBinaryFile("library/" + lang + "/" + curBook.id + ".spr/" + curPart.id + "/" + curChapter.id + ".snn", function (success, notes) {
				if (success) {
					parseNote(el, notes[i]);
					noteCache = notes;
				} else {
					back.click();
					notify("error", "Unable to Load Notes", "The notes could not be loaded. Please check your network connection or try again later.", { "OK": null });
				}
			});
		})();
	}
}
// readLines("/eng/nt.spr/matt/2.sch", [2, 3, 6, 18, 20, 21, 22], function (selection) {
// 	console.log(selection);
// });

function touchStart(e, t) {
	t.x = e.touches[0].clientX;
	t.y = e.touches[0].clientY;
}
function touchEnd(e, t, f) { // Functions listed [right, left, up, down]
	if (!t.x || !t.y) {
		return;
	}
	var xDiff = t.x - e.changedTouches[0].clientX;
	var yDiff = (t.y - e.changedTouches[0].clientY) * 1.25;
	if (Math.abs(xDiff) > Math.abs(yDiff)) {
		if (xDiff >= 10) { // Left
			if (f[1]) {
				f[1](t.x >= document.body.clientWidth - 25);
			}
		} else if (xDiff <= 10) { // Right
			if (f[0]) {
				f[0](t.x <= 25);
			}
		}
	} else if (f.length > 2 && Math.abs(yDiff) > Math.abs(xDiff)) {
		if (yDiff >= 10) { // Up
			if (f[2]) {
				f[2](t.y >= document.body.clientHeight - 25);
			}
		} else if (yDiff <= 10) { // Down
			if (f[3]) {
				f[3](t.y <= 25);
			}
		}
	}
	t.x = null;
	t.y = null;
}
document.getElementById("content").addEventListener("touchstart", function (e) { touchStart(e, contentTouch) });
document.getElementById("content").addEventListener("touchend", function (e) { touchEnd(e, contentTouch, [function (edge) {
	if (edge || document.getElementById("reader").classList.contains("hidden")) {
		closeInspector();
		back.click();
	}
}, null])});
document.getElementById("modal").addEventListener("touchstart", function (e) {
	if (!window.matchMedia("(max-height: 600px)").matches && (e.target.closest("#modal-header") || document.getElementById("modal-content").scrollTop <= 0)) {
		touchStart(e, modalTouch);
	}
});
document.getElementById("modal").addEventListener("touchend", function (e) {
	if (!window.matchMedia("(max-height: 600px)").matches && (e.target.closest("#modal-header") || document.getElementById("modal-content").scrollTop <= 0)) {
		touchEnd(e, modalTouch, [null, null, null, function () { document.body.classList.remove("modal") }]);
	}
});

function menu(target) {
	var el = document.getElementById(target);
	if (el.classList.contains("open")) {
		el.classList.remove("open");
	} else {
		el.classList.add("open");
		setTimeout(function () {
			document.addEventListener("click", function (e) {
				if (!e.target.closest(target) && e.target.tagName.toLowerCase() != "hr") {
					this.removeEventListener("click", arguments.callee);
					el.classList.remove("open");
				}
			});
		}, 0);
	}
}
function modal() {
	document.body.classList.add("modal");
}
