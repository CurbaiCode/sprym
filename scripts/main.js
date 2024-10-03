var lang = "en";
var revision = true;
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
var reader = document.getElementById("reader");
reader.addEventListener("scroll", function () {
	document.getElementById("progress").style.width = (Math.min(Math.max(reader.scrollTop / (reader.scrollHeight - reader.clientHeight), 0), 1) * 100) + "%";
});
document.getElementById("switch-font").addEventListener("change", function () {
	reader.classList.toggle("font", document.getElementById("switch-font").checked);
	document.getElementById("inspector").classList.toggle("font", document.getElementById("switch-font").checked);
});
document.getElementById("switch-versed").addEventListener("change", function () {
	reader.classList.toggle("paragraph", !document.getElementById("switch-versed").checked);
});
document.getElementById("switch-clarity").addEventListener("change", function () {
	reader.classList.toggle("clarity", document.getElementById("switch-clarity").checked);
	document.getElementById("inspector").classList.toggle("clarity", document.getElementById("switch-clarity").checked);
});

function readBinaryFile(file, callback) {
	var xhr = new XMLHttpRequest();
	xhr.responseType = "arraybuffer";
	xhr.open("GET", file, true);
	xhr.addEventListener("load", function () {
		if (xhr.status >= 200 && xhr.status < 300) {
			try {
				callback(true, msgpackr.unpack(xhr.response));
			} catch {
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
	reader.classList.remove("verse", "manual");
	reader.classList.toggle("font", document.getElementById("switch-font").checked);
	reader.classList.toggle("paragraph", !document.getElementById("switch-versed").checked);
	reader.classList.toggle("clarity", document.getElementById("switch-clarity").checked);
	if (type == "verse") {
		reader.classList.add("verse");
		var v = 1; // Verse number
		for (var line of text.split(/\n(?![^\^]*\/\^)/g)) { // Preserve revision group newlines
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
					if (match[2]) { // Revision
						var subCount = 0; // Contained notes
						var newSubline = match[2];
						while (submatch = /<([^>]+)>/g.exec(match[2])) { // Mini verse Parse()
							if (match[2].split("~")[0].startsWith("<")) { // Special Case: If revision begins with a note, then combine notes to avoid superimposition
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
						if (document.getElementById("switch-revisions").checked) {
							t = newSubline.split("~")[1];
							var revisionLen = t.split("\n").length;
						}
						while (emMatch = /`([^\|]+?)`[^\|]/g.exec(t)) { // Emphasize ` `, but not `| `
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
						if (document.getElementById("switch-revisions").checked) {
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
						if (document.getElementById("switch-revisions").checked) {
							v = v - (revisionLen - originalLen);
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
	} else if (type == "manual") {
		reader.classList.add("manual");
		for (var group of text.split("\n\n")) {
			var newGroup = group;
			while (match = /<(.*?)>/.exec(newGroup)) {
				newGroup = newGroup.replace(match[0], "");
				group = group.replace(match[0], '<span onclick="">' + match[1] + "</span>");
			}
			group = group.replaceAll(/^\s*\*\*\*\s*$/g, "<hr>").replaceAll(/^\s*---\s*$/g, "<hr>").replaceAll(/^\s*===\s*$/g, "<hr>");
			while (match = /`(.*?)`/g.exec(group)) {
				group = group.replace(match[0], "<em>" + match[1] + "</em>");
			}
			while (match = /\*(.*?)\*/g.exec(group)) {
				group = group.replace(match[0], "<strong>" + match[1] + "</strong>");
			}
			var hLevel = 0;
			var parent = document.createElement("li");
			if (group.startsWith("@")) {
				hLevel = parseInt(group.charAt(1));
				group = group.replace(/@[1-4]\s*/, "");
			} else if (group.startsWith("|")) {
				parent.classList.add("info-box");
				var ib = document.createElement("h4");
				ib.innerHTML = group.split("\n")[0].slice(1);
				parent.appendChild(ib);
				group = group.replace(/\|.*?\n/, "");
			}
			if (group.startsWith("!")) {
				parent.classList.add("figure");
				group = group.replace(/!/, "").split(/\n/g);
				var img = document.createElement("img");
				img.loading = "lazy";
				img.src = "library/" + lang + "/" + curBook.id + ".spr/book.img/" + curChapter.id + "/" + group[0].split("!")[0];
				img.alt = group[0].split("!")[1] || group[1];
				parent.appendChild(img);
				if (group[1]) {
					var caption = document.createElement("p");
					caption.innerHTML = group[1];
					parent.appendChild(caption);
				}
			} else if (group.startsWith("?")) {
				parent.classList.add("quote");
				group = group.replace(/\?/, "").split(/\n/g);
				var img = document.createElement("img");
				img.loading = "lazy";
				img.src = "library/" + lang + "/" + curBook.id + ".spr/book.img/" + curChapter.id + "/" + group[0].split("?")[0];
				img.alt = group[0].split("?")[1];
				parent.appendChild(img);
				group = group.slice(1);
				for (var p of group) {
					var caption = document.createElement("p");
					caption.innerHTML = p;
					parent.appendChild(caption);
				}
			} else {
				for (var line of group.split(/\n(?=[^(?=\s*\~)(?=\s*\#)(?=\s*\_)])/g)) {
					if (line.startsWith("@")) {
						var i = document.createElement("h" + (parseInt(line.charAt(1)) + 4));
						i.innerHTML = line.split("\n")[0].slice(2);
						parent.appendChild(i);
						line = line.split("\n").slice(1).join("\n");
					}
					if (hLevel > 0 && hLevel <= 4) {
						var item = document.createElement("h" + (hLevel + 2));
						item.innerHTML = line;
					} else if (/^#/m.exec(line)) {
						var item = document.createElement("ol");
						item.classList.add("numbered");
						for (var subLine of line.split("\n")) {
							if (subLine.startsWith("#") || subLine.startsWith("_")) {
								var subItem = document.createElement("li");
								if (subLine.startsWith("_")) {
									subItem.classList.add("nomarker");
								}
								subItem.innerHTML = subLine.replace(/(#|_)\s*/, "");
								item.appendChild(subItem);
							} else {
								var subItem = document.createElement("p");
								subItem.innerHTML = subLine;
								parent.appendChild(subItem);
							}
						}
					} else if (/^~/m.exec(line)) {
						var item = document.createElement("ul");
						for (var subLine of line.split("\n")) {
							if (l = /^\s?(?=~|_)/g.exec(subLine)) {
								var subItem = document.createElement("li");
								if (/^\s?_/.exec(subLine)) {
									subItem.classList.add("nomarker");
								}
								if (l[0].length > 0) {
									subItem.classList.add("nomarker");
									var list = document.createElement("ul");
									var subList = document.createElement("li");
									subList.innerHTML = subLine.replace(/\s*(~|_)\s*/, "");
									list.appendChild(subList);
									subItem.appendChild(list);
								} else {
									subItem.innerHTML = subLine.replace(/(~|_)\s*/, "");
								}
								item.appendChild(subItem);
							} else {
								var subItem = document.createElement("p");
								subItem.innerHTML = subLine;
								parent.appendChild(subItem);
							}
						}
					} else if (/^_/m.exec(line)) {
						var item = document.createElement("ul");
						for (var subLine of line.split("\n")) {
							if (subLine.startsWith("_")) {
								var subItem = document.createElement("li");
								subItem.classList.add("nomarker");
								subItem.innerHTML = subLine.replace(/_\s*/, "");
								item.appendChild(subItem);
							} else {
								var subItem = document.createElement("p");
								subItem.innerHTML = subLine;
								parent.appendChild(subItem);
							}
						}
					} else if (line != "<hr>") {
						var item = document.createElement("p");
						item.innerHTML = line;
					}
					if (line == "<hr>") {
						parent = document.createElement("hr");
					} else {
						parent.appendChild(item);
					}
				}
			}
			el.appendChild(parent);
		}
	} else {
		el.textContent = text;
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
function format(string) {
	return string.replaceAll(/`(.*?)`/g, "<em>$1</em>");
}
function noFormat(string) {
	return string.replaceAll(/`(.*?)`/g, "$1").replaceAll(/<em>(.*?)<\/em>/g, "$1");
}
function swap(el, txt, timing) {
	el.classList.add("swapping");
	setTimeout(function () {
		el.innerHTML = format(txt);
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
	document.getElementById("progress").style.opacity = "";
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
			document.title = noFormat(data.name) || "Collection";
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
			document.title = noFormat(data.name) || "Book";
			swap(title, data.name || "Book", .35);
			curBook = data;
			curPart = { "id": "SKIP" };
			if (load) {
				bookCatalog();
			}
			break;
		case "part":
			setBack(function () { slide("book", null, curBook, false) }, curBook.short || curBook.name);
			document.title = noFormat(data.name) || "Part";
			swap(title, data.name || "Part", .35);
			curPart = data;
			if (load) {
				partCatalog();
			}
			break;
		case "reader":
			document.getElementById("progress").style.opacity = "1"; // Show progress bar
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
			document.title = noFormat(label);
			swap(title, label || "Chapter", .35);
			curChapter = data;
			if (load) {
				reader.scrollTop = 0;
				document.getElementById("progress").style.width = ""; // Reset progress bar
				chapterCatalog(data.id);
			}
			break;
		case "inspector":
			document.getElementById("progress").style.opacity = "1"; // Show progress bar
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
				img.src = "library/" + (collection.imgLang ? lang + "/" : "") + collection.id + ".jpg";
				img.srcset = "library/" + (collection.imgLang ? lang + "/" : "") + collection.id + "@2x.jpg 2x, library/" + (collection.imgLang ? lang + "/" : "") + collection.id + "@3x.jpg 3x";
				img.addEventListener("error", function () {
					this.removeEventListener("error", arguments.callee);
					this.removeAttribute("srcset");
					this.addEventListener("error", function () {
						this.removeEventListener("error", arguments.callee);
						this.src = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"; // Valid empty image fallback
					});
				});
				var label = document.createElement("p");
				label.innerHTML = format(collection.name);
				(function () {
					var c = collection;
					item.addEventListener("click", function () {
						slide("collection", "lib", c, document.getElementById("books").innerHTML == "" || (curCollection && c.id != curCollection.id)); // Load books the first time, then if different collection
					});
				})();
				item.appendChild(img);
				item.appendChild(label);
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
				err.appendChild(msg);
				err.appendChild(action);
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
			img.srcset = "library/" + lang + "/" + bookID + ".spr/cover@2x.jpg 2x, library/" + lang + "/" + bookID + ".spr/cover@3x.jpg 3x";
			img.addEventListener("error", function () {
				this.removeEventListener("error", arguments.callee);
				this.removeAttribute("srcset");
				this.addEventListener("error", function () {
					this.removeEventListener("error", arguments.callee);
					this.src = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E"; // Valid empty image fallback
				});
			});
			item.appendChild(img);
			(function () {
				var bID = bookID;
				var i = item;
				var l = label;
				readBinaryFile("library/" + lang + "/" + bookID + ".spr/book.stc", function (success, book) {
					if (success) {
						l.innerHTML = format(book.name);
						i.addEventListener("click", function () {
							slide("book", null, book, document.getElementById("parts").innerHTML == "" || bID != curBook.id); // Load parts the first time, then if different book
						});
						i.appendChild(l);
					} else {
						el.removeChild(i); // Remove from display
						if (el.children.length <= 0) { // If this results in no books
							curCollection = null;
							back.click();
							notify("error", "No Books Found", "No books were found in this collection.", { "OK": null });
						}
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
					if (part.before) {
						var before = document.createElement("span");
						before.innerHTML = format(part.before);
						label.appendChild(before);
					}
					label.insertAdjacentHTML("beforeend", format(part.name)); // Add part name to label
					if (part.after) {
						var after = document.createElement("span");
						after.innerHTML = format(part.after);
						label.appendChild(after);
					}
					(function () {
						var p = part;
						if (p.chapters) {
							item.addEventListener("click", function () {
								slide("part", null, p, document.getElementById("chapters").innerHTML == "" || p.id != (curPart.id || "")); // Load chapters the first time, then if different part
							});
						} else {
							item.classList.add("chapter");
							item.addEventListener("click", function () {
								slide("reader", null, p);
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
			if (chapter.before) {
				var before = document.createElement("span");
				before.innerHTML = format(chapter.before);
				label.appendChild(before);
			}
			label.insertAdjacentHTML("beforeend", format(chapter.name)); // Add chapter name to label
			if (chapter.after) {
				var after = document.createElement("span");
				after.innerHTML = format(chapter.after);
				label.appendChild(after);
			}
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
		document.getElementById("chapter").style.display = "none";
		document.getElementById("summary").style.display = "none";
		document.getElementById("head").style.display = "";
		document.getElementById("supheading").innerHTML = format(curChapter.before || "");
		document.getElementById("heading").innerHTML = format(curChapter.title || curChapter.name);
		document.getElementById("subheading").innerHTML = format(curChapter.subtitle || curChapter.after || "");
		document.getElementById("intro").innerHTML = format(curChapter.intro || "");
		document.getElementById("superhead").style.display = "";
		(function () {
			var c = curChapter;
			readFile("library/" + lang + "/" + curBook.id + ".spr/" + curChapter.id + ".sch", function (success, contents) {
				if (success) {
					var body = document.createElement("ol");
					parse(body, c.type, contents);
					document.getElementById("article").appendChild(body);
				} else {
					notify("error", "Unable to Load Chapter", "The chapter could not be loaded. Please check your network connection or try again later.", { "OK": null });
				}
			});
		})();
	} else {
		document.getElementById("head").style.display = "";
		for (var chapter of partCache) { // Search for selected chapter
			if (chapter.id == curChapter.id) {
				if (chapter.first == true) { // Populate heading above first chapter
					document.getElementById("supheading").textContent = "";
					document.getElementById("heading").innerHTML = format(curPart.title || "");
					document.getElementById("subheading").innerHTML = format(curPart.subtitle || "");
					document.getElementById("intro").innerHTML = format(curPart.intro || "");
					document.getElementById("superhead").style.display = "";
				} else {
					document.getElementById("superhead").style.display = "none";
				}
				document.getElementById("chapter").style.display = "";
				document.getElementById("summary").style.display = "";
				document.getElementById("chapter").textContent = format(chapter.title || chapter.name);
				document.getElementById("summary-text").textContent = chapter.summary || "";
				(function () {
					var c = chapter;
					readFile("library/" + lang + "/" + curBook.id + ".spr/" + curPart.id + "/" + curChapter.id + ".sch", function (success, contents) {
						if (success) {
							var body = document.createElement("ol");
							parse(body, c.type, contents);
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
			var path = n.split("/");
			var chapter = path[2].split(":")[0];
			var ref = path[2].split(":")[1];
			var list = ref.split("#")[0].split(",");
			var verses = [];
			for (var v of list) {
				if (v.includes("-")) {
					for (var i = parseInt(v.split("-")[0]); i <= parseInt(v.split("-")[1]); i++) {
						verses.push(i);
					}
				} else {
					verses.push(parseInt(v));
				}
			}
			var target = ref.split("#")[1];
			(function () {
				var nn = n;
				var i = item;
				var p = path;
				var c = chapter;
				var v = verses;
				var t = target;
				var l = document.createElement("p");
				l.classList.add("label");
				l.addEventListener("click", function () {
					notify("message", "Note Clicked", nn, { "OK": null });
				});
				i.appendChild(l);
				readLines("library/" + lang + "/" + p[0] + ".spr/" + p[1] + "/" + c + ".sch", v, function (success, selection) {
					if (success) {
						var passage = document.createElement("ol");
						passage.classList.add("reader");
						parse(passage, "verse", selection.join("\n"));
						var remove = passage.getElementsByTagName("sup");
						while (remove.length) {
							remove[0].parentNode.removeChild(remove[0]);
						}
						for (var el of passage.querySelectorAll("[id], [onclick]")) {
							el.removeAttribute("id");
							el.removeAttribute("onclick");
						}
						for (var x = 0; x < v.length; x++) {
							passage.children[x].dataset.counter = v[x];
							if (t && v[x] == t) {
								passage.children[x].classList.add("target");
							} else if (!t && v[x] == v[0]) {
								passage.children[x].classList.add("target");
							}
						}
						if (t && v.length > 1) {
							var m = document.createElement("button");
							var s = document.createElement("i");
							i.classList.add("more");
							s.classList.add("gs");
							s.textContent = "chevron-right";
							m.addEventListener("click", function () {
								i.classList.toggle("show");
							});
							m.appendChild(s);
							i.appendChild(m);
							Gust();
						}
						i.appendChild(passage);
					}
				});
				readBinaryFile("library/" + lang + "/" + p[0] + ".spr/book.stc", function (success, book) {
					if (success) {
						p[2] = p[2].replaceAll("-", "–");
						if (book.parts && book.parts.length > 0) { // If book found
							l.textContent = p[1] + " " + p[2].split("#")[0];
							var b = document.createElement("span");
							b.innerHTML = format(book.name);
							l.appendChild(b);
							for (var part of book.parts) { // Search for selected part
								if (part.id == p[1]) {
									l.innerHTML = format(part.name) + " " + p[2].split("#")[0];
									l.appendChild(b);
								}
							}
						} else {
							l.textContent = nn;
						}
					} else {
						l.textContent = nn;
					}
				});
			})();
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
	var cn = link.childNodes;
	for (var i = 0; i < cn.length; i++) { // Search for title label
		if (cn[i].nodeType == Node.TEXT_NODE) {
			t = cn[i].nodeValue;
			break;
		}
	}
	document.getElementById("inspector").classList.toggle("clarity", document.getElementById("switch-clarity").checked);
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

function prev() {
	if (partCache.indexOf(curChapter) > 0) {
		slide("reader", null, partCache[partCache.indexOf(curChapter) - 1]);
	} else if (bookCache.indexOf(curPart) > 0) {
		curPart = bookCache[bookCache.indexOf(curPart) - 1];
		partCatalog();
		slide("reader", null, curPart.chapters[curPart.chapters.length - 1]);
	}
}
function next() {
	if (partCache.indexOf(curChapter) < partCache.length - 1) {
		slide("reader", null, partCache[partCache.indexOf(curChapter) + 1]);
	} else if (bookCache.indexOf(curPart) < bookCache.length - 1) {
		curPart = bookCache[bookCache.indexOf(curPart) + 1];
		partCatalog();
		slide("reader", null, curPart.chapters[0]);
	}
}

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
		if (xDiff >= 16) { // Left
			if (f[1]) {
				f[1](t.x >= document.body.clientWidth - 25);
			}
		} else if (xDiff <= 16) { // Right
			if (f[0]) {
				f[0](t.x <= 25);
			}
		}
	} else if (f.length > 2 && Math.abs(yDiff) > Math.abs(xDiff)) {
		if (yDiff >= 16) { // Up
			if (f[2]) {
				f[2](t.y >= document.body.clientHeight - 25);
			}
		} else if (yDiff <= 16) { // Down
			if (f[3]) {
				f[3](t.y <= 25);
			}
		}
	}
	t.x = null;
	t.y = null;
}
document.getElementById("content").addEventListener("touchstart", function (e) { touchStart(e, contentTouch) });
document.getElementById("content").addEventListener("touchend", function (e) { touchEnd(e, contentTouch, [
	function (edge) {
		if (edge || document.getElementById("reader").classList.contains("hidden")) {
			closeInspector();
			back.click();
		} else if (!edge && document.getElementById("part").classList.contains("hidden") && !document.getElementById("reader").classList.contains("hidden")) {
			prev();
		}
	}, function (edge) {
		if (!edge && document.getElementById("part").classList.contains("hidden") && !document.getElementById("reader").classList.contains("hidden")) {
			next();
		}
	}
])});
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
function modal(id) {
	document.getElementById("modal-title").textContent = document.getElementById(id).dataset.title;
	var m = document.getElementById("modal-content").children;
	for (var i = 0; i < m.length; i++) {
		if (m[i].id == id) {
			m[i].style.display = "";
		} else {
			m[i].style.display = "none";
		}
	}
	document.body.classList.add("modal");
}
