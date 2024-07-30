var lang = "eng";
var translation = false;
var libraryCache, collectionCache, bookCache, partCache, noteCache;
var curCollection, curBook, curPart, curChapter;

function mode(b) {
	if (b) {
		document.body.setAttribute("data-theme", b);
	}
}
function handler(e) {
	var storedTheme = localStorage.getItem("theme") || (e.matches ? "dark" : "light");
	mode(storedTheme);
}
var mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
if (mediaQuery.addEventListener) {
	mediaQuery.addEventListener("change", handler);
} else {
	mediaQuery.addListener(handler);
}
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
	mode("dark");
}
mode(localStorage.getItem("theme"));
libCatalog();

function readBinaryFile(file, callback) {
	var xhr = new XMLHttpRequest();
	xhr.responseType = "arraybuffer";
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () { callback(msgpackr.unpack(xhr.response)) });
	xhr.send(null);
}
function readFile(file, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () { callback(xhr.responseText) });
	xhr.send(null);
}
function readLines(file, lineNumbers, callback) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () {
		var lines = xhr.responseText.replace(/\n\n/g, "\n").replace(/~([^\^]+)\/\^/g, "").replace(/\^/g, "").split("\n");
		callback(lineNumbers.map(function (line) { return lines[line - 1] }));
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
				item.id = "v" + v;
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
						if (translation) {
							t = newSubline.split("~")[1]
						}
						while (emMatch = /`([^\|]+)`/g.exec(t)) { // Emphasize ` `, but not `| `
							t = t.replace(emMatch[0], '<em class="jst">' + emMatch[1] + "</em>");
						}
						var first = true;
						var u = 0; // Contained verse number
						for (var verse of t.split("\n")) {
							++u;
							if (!first) { // First verse is the container
								t = t.replace(verse, '<li id="v' + (v + u) + '"><span>' + verse + "</span></li>");
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
						item.id = "v" + v; // I don't know why this works
						v = v + u - 1; // Reset verse number for following verses
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

var prev = document.getElementById("prev");
var prevIcon = document.getElementById("prev-icon");
var prevLabel = document.getElementById("prev-label");
var title = document.getElementById("title");
var pages = document.getElementById("main").children;
var tabs = document.getElementById("nav").children;
function previous(action, label, hide = "") {
	switch (hide) {
		case "button":
			prev.style.visibility = "hidden";
			prevIcon.style.display = "";
			break;
		case "icon":
			prevIcon.style.display = "none";
			prev.style.visibility = "";
	}
	prev.onclick = action;
	prevLabel.textContent = label;
	if (hide == "") {
		prev.style.visibility = "";
		prevIcon.style.display = "";
	}
}
function slide(page, tab, data = undefined, load = true) {
	if (tab == "none") { // No active tab
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
	if (page != "search") {
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
	}
	switch (page) {
		case "search":
			console.log("SEARCH WIP");
			previous(function () { console.log("CANCEL SEARCH IGNORED") }, "Cancel", "icon");
			document.title = "Search | Sprym";
			title.textContent = "Search";
			break;
		case "home":
			previous(function () {}, "", "button");
			document.title = "Sprym";
			title.textContent = "Home";
			break;
		case "library":
			previous(function () { slide("home", "home") }, "");
			document.title = "Library";
			title.textContent = "Library";
			break;
		case "collection":
			previous(function () { slide("library", "lib") }, "Library");
			document.title = data.name || "Collection";
			title.textContent = data.name || "Collection";
			curCollection = data;
			if (load) {
				collectionCatalog();
			}
			break;
		case "book":
			previous(function () { slide("collection", "lib", curCollection, false) }, curCollection.short || curCollection.name);
			document.title = data.name || "Book";
			title.textContent = data.name || "Book";
			curBook = data;
			curPart = { "id": "SKIP" };
			if (load) {
				bookCatalog();
			}
			break;
		case "part":
			previous(function () { slide("book", "none", curBook, false) }, curBook.short || curBook.name);
			document.title = data.name || "Part";
			title.textContent = data.name || "Part";
			curPart = data;
			if (load) {
				partCatalog();
			}
			break;
		case "reader":
			var label = data.name;
			var pLabel = "";
			if (curPart.id == "SKIP") { // If part skipped
				pLabel = curBook.short || curBook.name;
			} else {
				pLabel = curPart.short || curPart.name;
			}
			if (data.short) {
				label = curPart.name + " " + data.short;
				pLabel = "";
			}
			if (curPart.id == "SKIP") { // If part skipped
				previous(function () { slide("book", "none", curBook, false) }, pLabel);
			} else {
				previous(function () { slide("part", "none", curPart, false) }, pLabel);
			}
			document.title = label;
			title.textContent = label || "Chapter";
			curChapter = data;
			if (load) {
				chapterCatalog(data.id);
			}
			break;
		case "inspector":
			var label = curChapter.name;
			if (curChapter.short) {
				label = (curPart.short || curPart.name) + " " + curChapter.short;
			}
			previous(function () { slide("reader", "none", curChapter, false) }, label);
			title.textContent = data || "Inspector";
			break;
		default:
			document.title = "Sprym";
			title.textContent = "Sprym";
	}
}

function libCatalog() { // Get collections
	readBinaryFile("library/" + lang + "/library.scl", function (library) {
		var el = document.getElementById("collections");
		for (var collection of library) {
			var item = document.createElement("li");
			var img = document.createElement("img");
			img.loading = "lazy";
			img.src = "library/" + lang + "/" + collection.id + "/display.jpg";
			var label = document.createElement("p");
			label.textContent = collection.name;
			(function () {
				var c = collection;
				item.addEventListener("click", function () {
					slide("collection", "lib", c, document.getElementById("books").innerHTML == "" || c.id != curCollection.id); // Load books the first time, then if different collection
				});
			})();
			item.appendChild(img);
			item.appendChild(label);
			el.appendChild(item);
		}
		libraryCache = library;
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
	if (booklist) { // If found
		var el = document.getElementById("books");
		while (el.firstChild) { // Clear books
			el.removeChild(el.lastChild);
		}
		for (var bookID of booklist) {
			var item = document.createElement("li");
			var img = document.createElement("img");
			var label = document.createElement("p");
			img.loading = "lazy";
			img.src = "library/" + lang + "/" + curCollection.id + "/" + bookID + ".spr/cover.jpg";
			item.appendChild(img);
			(function () {
				var bID = bookID;
				var i = item;
				var l = label;
				readBinaryFile("library/" + lang + "/" + curCollection.id + "/" + bookID + ".spr/book.stc", function (book) {
					l.textContent = book.name;
					i.addEventListener("click", function () {
						slide("book", "none", book, document.getElementById("parts").innerHTML == "" || bID != curBook.id); // Load parts the first time, then if different book
					});
				});
			})();
			item.appendChild(label);
			el.appendChild(item);
		}
		collectionCache = booklist;
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
	readBinaryFile("library/" + lang + "/" + curCollection.id + "/" + curBook.id + ".spr/book.stc", function (book) {
		for (var part of book.parts) {
			var item = document.createElement("li");
			var label = document.createElement("p");
			label.textContent = part.name;
			(function () {
				var b = book;
				var p = part;
				if (p.type == "skip") {
					if (p.id == "stp") {
						item.addEventListener("click", function () {
							slide("reader", "none", p);
						});
					}
				} else {
					item.addEventListener("click", function () {
						slide("part", "none", p, document.getElementById("chapters").innerHTML == "" || p.id != (curPart.id || "")); // Load chapters the first time, then if different part
					});
				}
			})();
			item.appendChild(label);
			el.appendChild(item);
		}
		bookCache = book.parts;
	});
}
function partCatalog() { // Get chapters
	var chapters;
	for (var part of bookCache) { // Search for selected part
		if (part.id == curPart.id) {
			chapters = part.chapters;
			break;
		}
	}
	if (chapters) { // If found
		var el = document.getElementById("chapters");
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
					slide("reader", "none", c, document.getElementById("article").innerHTML == "" || c.id != (curChapter.id || "")); // Load article if first load of part or if different chapter
				});
			})();
			item.appendChild(label);
			el.appendChild(item);
		}
		partCache = chapters;
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
			readBinaryFile("library/" + lang + "/" + curCollection.id + "/" + curBook.id + ".spr/book.stp", function (titlePage) {
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
					readFile("library/" + lang + "/" + curCollection.id + "/" + curBook.id + ".spr/" + curPart.id + "/" + curChapter.id + ".sch", function (contents) {
						var body = document.createElement("ol");
						parse(body, "verse", contents);
						document.getElementById("article").appendChild(body);
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
	var t;
	for (var child of link.childNodes) { // Search for title label
		if (child.nodeType == Node.TEXT_NODE) {
			t = id + " " + child.nodeValue;
			break;
		}
	}
	slide("inspector", "none", t);
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
			readBinaryFile("library/" + lang + "/" + curCollection.id + "/" + curBook.id + ".spr/" + curPart.id + "/" + curChapter.id + ".snn", function (notes) {
				parseNote(el, notes[i]);
				noteCache = notes;
			});
		})();
	}
}
// readLines("/eng/scriptures/nt.spr/matt/2.sch", [2, 3, 6, 18, 20, 21, 22], function (selection) {
// 	console.log(selection);
// });
