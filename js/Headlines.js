'use strict';
/* global __, ngettext */
define(["dojo/_base/declare"], function (declare) {
	Headlines = {
		vgroup_last_feed: undefined,
		_headlines_scroll_timeout: 0,
		loaded_article_ids: [],
		current_first_id: 0,
		catchup_id_batch: [],
		click: function (event, id, in_body) {
			in_body = in_body || false;

			if (App.isCombinedMode()) {

				if (!in_body && (event.ctrlKey || id == Article.getActive() || App.getInitParam("cdm_expanded"))) {
					Article.openInNewWindow(id);
					Headlines.toggleUnread(id, 0);
					return false;
				}

				if (Article.getActive() != id) {
					Article.setActive(id);

					if (!App.getInitParam("cdm_expanded"))
						Article.cdmScrollToId(id);
				} else if (in_body) {
					Headlines.toggleUnread(id, 0);
				}

				return in_body;

			} else {
				if (event.ctrlKey) {
					Article.openInNewWindow(id);
					Headlines.toggleUnread(id, 0);
				} else {
					Article.view(id);
				}

				return false;
			}
		},
		initScrollHandler: function () {
			$("headlines-frame").onscroll = (event) => {
				clearTimeout(this._headlines_scroll_timeout);
				this._headlines_scroll_timeout = window.setTimeout(function () {
					//console.log('done scrolling', event);
					Headlines.scrollHandler();
				}, 50);
			}
		},
		loadMore: function () {
			const view_mode = document.forms["toolbar-main"].view_mode.value;
			const unread_in_buffer = $$("#headlines-frame > div[id*=RROW][class*=Unread]").length;
			const num_all = $$("#headlines-frame > div[id*=RROW]").length;
			const num_unread = Feeds.getUnread(Feeds.getActive(), Feeds.activeIsCat());

			// TODO implement marked & published

			let offset = num_all;

			switch (view_mode) {
				case "marked":
				case "published":
					console.warn("loadMore: ", view_mode, "not implemented");
					break;
				case "unread":
					offset = unread_in_buffer;
					break;
				case "adaptive":
					if (!(Feeds.getActive() == -1 && !Feeds.activeIsCat()))
						offset = num_unread > 0 ? unread_in_buffer : num_all;
					break;
			}

			console.log("loadMore, offset=", offset);

			Feeds.open({feed: Feeds.getActive(), is_cat: Feeds.activeIsCat(), offset: offset});
		},
		scrollHandler: function () {
			try {
				Headlines.unpackVisible();

				if (App.isCombinedMode()) {
					Headlines.updateFloatingTitle();

					// set topmost child in the buffer as active, but not if we're at the beginning (to prevent auto marking
					// first article as read all the time)
					if ($("headlines-frame").scrollTop != 0 &&
						App.getInitParam("cdm_expanded") && App.getInitParam("cdm_auto_catchup") == 1) {

						const rows = $$("#headlines-frame > div[id*=RROW]");

						for (let i = 0; i < rows.length; i++) {
							const row = rows[i];

							if ($("headlines-frame").scrollTop <= row.offsetTop &&
								row.offsetTop - $("headlines-frame").scrollTop < 100 &&
								row.getAttribute("data-article-id") != Article.getActive()) {

								Article.setActive(row.getAttribute("data-article-id"));
								break;
							}
						}
					}
				}

				if (!Feeds.infscroll_disabled) {
					const hsp = $("headlines-spacer");
					const container = $("headlines-frame");

					if (hsp && hsp.offsetTop - 250 <= container.scrollTop + container.offsetHeight) {

						hsp.innerHTML = "<span class='loading'><img src='images/indicator_tiny.gif'> " +
							__("Loading, please wait...") + "</span>";

						Headlines.loadMore();
						return;
					}
				}

				if (App.getInitParam("cdm_auto_catchup") == 1) {

					let rows = $$("#headlines-frame > div[id*=RROW][class*=Unread]");

					for (let i = 0; i < rows.length; i++) {
						const row = rows[i];

						if ($("headlines-frame").scrollTop > (row.offsetTop + row.offsetHeight / 2)) {
							const id = row.getAttribute("data-article-id")

							if (this.catchup_id_batch.indexOf(id) == -1)
								this.catchup_id_batch.push(id);

						} else {
							break;
						}
					}

					if (Feeds.infscroll_disabled) {
						const row = $$("#headlines-frame div[id*=RROW]").last();

						if (row && $("headlines-frame").scrollTop >
							(row.offsetTop + row.offsetHeight - 50)) {

							console.log("we seem to be at an end");

							if (App.getInitParam("on_catchup_show_next_feed") == "1") {
								Feeds.openNextUnread();
							}
						}
					}
				}
			} catch (e) {
				console.warn("scrollHandler", e);
			}
		},
		updateFloatingTitle: function (status_only) {
			if (!App.isCombinedMode()/* || !App.getInitParam("cdm_expanded")*/) return;

			const safety_offset = 120; /* px, needed for firefox */
			const hf = $("headlines-frame");
			const elems = $$("#headlines-frame > div[id*=RROW]");
			const ft = $("floatingTitle");

			for (let i = 0; i < elems.length; i++) {
				const row = elems[i];

				if (row && row.offsetTop + row.offsetHeight > hf.scrollTop + safety_offset) {

					const header = row.select(".header")[0];
					const id = row.getAttribute("data-article-id");

					if (status_only || id != ft.getAttribute("data-article-id")) {
						if (id != ft.getAttribute("data-article-id")) {

							ft.setAttribute("data-article-id", id);
							ft.innerHTML = header.innerHTML;

							ft.select(".dijitCheckBox")[0].outerHTML = "<i class=\"material-icons icon-anchor\" onclick=\"Article.cdmScrollToId(" + id + ", true)\">expand_more</i>";

							this.initFloatingMenu();

						}

						if (row.hasClassName("Unread"))
							ft.addClassName("Unread");
						else
							ft.removeClassName("Unread");

						if (row.hasClassName("marked"))
							ft.addClassName("marked");
						else
							ft.removeClassName("marked");

						if (row.hasClassName("published"))
							ft.addClassName("published");
						else
							ft.removeClassName("published");

						PluginHost.run(PluginHost.HOOK_FLOATING_TITLE, row);
					}

					//ft.style.marginRight = hf.offsetWidth - row.offsetWidth + "px";

					/* if (header.offsetTop + header.offsetHeight < hf.scrollTop + ft.offsetHeight - 5 &&
						row.offsetTop + row.offsetHeight >= hf.scrollTop + ft.offsetHeight - 5)
						Element.show(ft);
					else
						Element.hide(ft); */

					if (hf.scrollTop - row.offsetTop <= header.offsetHeight + safety_offset)
						ft.fade({duration: 0.2});
					else
						ft.appear({duration: 0.2});

					return;
				}
			}
		},
		unpackVisible: function () {
			if (!App.isCombinedMode() || !App.getInitParam("cdm_expanded")) return;

			const rows = $$("#headlines-frame div[id*=RROW][data-content]");
			const threshold = $("headlines-frame").scrollTop + $("headlines-frame").offsetHeight + 600;

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];

				if (row.offsetTop <= threshold) {
					console.log("unpacking: " + row.id);

					row.select(".content-inner")[0].innerHTML = row.getAttribute("data-content");
					row.removeAttribute("data-content");

					PluginHost.run(PluginHost.HOOK_ARTICLE_RENDERED_CDM, row);
				} else {
					break;
				}
			}
		},
		renderHeadline: function (headlines, hl) {
			let row = null;

			let row_class = "";

			if (hl.marked) row_class += " marked";
			if (hl.published) row_class += " published";
			if (hl.unread) row_class += " Unread";

			if (headlines.vfeed_group_enabled && hl.feed_title && this.vgroup_last_feed != hl.feed_id) {
				let vgrhdr = `<div data-feed-id='${hl.feed_id}' class='feed-title'>
					<div style='float : right'>${hl.feed_icon}</div>
					<a class="title" href="#" onclick="Feeds.open({feed:${hl.feed_id}})">${hl.feed_title}
					<a class="catchup" onclick="Feeds.catchupFeedInGroup(${hl.feed_id})" href="#">${__('mark feed as read')}</a>
					</div>`

				const tmp = document.createElement("div");
				tmp.innerHTML = vgrhdr;

				$("headlines-frame").appendChild(tmp.firstChild);

				this.vgroup_last_feed = hl.feed_id;
			}

			if (App.isCombinedMode()) {
				row_class += App.getInitParam("cdm_expanded") ? " expanded" : " expandable";

				let originally_from = hl.orig_feed ? `<div>
					${__('Originally from:')} <a target="_blank" rel="noopener noreferrer" href="${hl.orig_feed[1]}">${hl.orig_feed[0]}</a>
					</div>` : "";

				let comments = "";

				if (hl.comments) {
					let comments_msg = __("comments");

					if (hl.num_comments > 0) {
						comments_msg = hl.num_comments + " " + ngettext("comment", "comments", hl.num_comments)
					}

					comments = `<a href="${hl.comments}">(${comments_msg})</a>`;
				}

				row = `<div class="cdm ${row_class} ${hl.score_class}" id="RROW-${hl.id}" data-article-id="${hl.id}" data-orig-feed-id="${hl.feed_id}" 
							data-content="${hl.content}" onmouseover="Article.mouseIn(${hl.id})" onmouseout="Article.mouseOut(${hl.id})">
							
							<div class="header">
								<div class="left">
									<input dojoType="dijit.form.CheckBox" type="checkbox" onclick="Headlines.onRowChecked(this)" class='rchk'>
									<i class="marked-pic marked-${hl.id} material-icons" onclick="Headlines.toggleMark(${hl.id})">star</i>
									<i class="pub-pic pub-${hl.id} material-icons" onclick="Headlines.togglePub(${hl.id})">rss_feed</i>
								</div>
								
								<span onclick="return Headlines.click(event, ${hl.id});" data-article-id="${hl.id}" class="titleWrap hlMenuAttach">
									<a class="title" title="${hl.title}" target="_blank" rel="noopener noreferrer" href="${hl.link}">
										${hl.title}</a>
									<span class="author">${hl.author}</span>
									<span class="HLLCTR-${hl.id}">${hl.labels}</span>
									${hl.cdm_excerpt ? hl.cdm_excerpt : ""}
								</span>
								
								<div class="feed">
									<a href="#" style="background-color: rgba(${hl.favicon_avg_color_rgba})" 
										onclick="Feeds.open({feed:${hl.feed_id}})">${hl.feed_title}</a>
								</div>
								
								<span class="updated" title="${hl.imported}">${hl.updated}</span>
								
								<div class="right">                        
									<i class="material-icons icon-score" title="${hl.score}" data-score="${hl.score}" 
										onclick="Article.setScore(${hl.id}, this)">${hl.score_pic}</i>
								
									<span style="cursor : pointer" title="${hl.feed_title}" onclick="Feeds.open({feed:${hl.feed_id}})">
										${hl.feed_icon}</span>
								</div>
										
							</div>
									
							<div class="content" onclick="return Headlines.click(event, ${hl.id}, true);">
								<div id="POSTNOTE-${hl.id}">${hl.note}</div>
								<div class="content-inner" lang="${hl.lang ? hl.lang : 'en'}"></div>
								<div class="intermediate">
									${originally_from}
									${hl.enclosures}
								</div>
								<div class="footer" onclick="event.stopPropagation()">
								
									<div class="left">
										${hl.buttons_left}
										<i class="material-icons">label_outline</i>
										<span id="ATSTR-${hl.id}">${hl.tags_str}</span>
										<a title="Edit tags for this article" href="#" 
											onclick="Article.editTags(${hl.id})">(+)</a>
										${comments}
									</div>
									
									<div class="right">${hl.buttons}</div>
								</div>
							</div>
						</div>`;


			} else {
				row = `<div class="hl ${row_class} ${hl.score_class}" data-orig-feed-id="${hl.feed_id}" data-article-id="${hl.id}" id="RROW-${hl.id}" 
					onmouseover="Article.mouseIn(${hl.id})" onmouseout="Article.mouseOut(${hl.id})">
				<div class="left">
					<input dojoType="dijit.form.CheckBox" type="checkbox" onclick="Headlines.onRowChecked(this)" class='rchk'>
				    <i class="marked-pic marked-${hl.id} material-icons" onclick="Headlines.toggleMark(${hl.id})">star</i>
				    <i class="pub-pic pub-${hl.id} material-icons" onclick="Headlines.togglePub(${hl.id})">rss_feed</i>
				</div>
				<div onclick="return Headlines.click(event, ${hl.id})" class="title">
					<span data-article-id="${hl.id}" class="hl-content hlMenuAttach">
						<a class="title" href="${hl.link}">${hl.title} <span class="preview">${hl.content_preview}</span></a>
						<!-- <span class="author">${hl.author}</span> -->
						<span class="HLLCTR-${hl.id}">${hl.labels}</span>
					</span>
				</div>
                <span class="feed">
                	<a style="background : rgba(${hl.favicon_avg_color_rgba})" href="#" onclick="Feeds.open({feed:${hl.feed_id}})">${hl.feed_title}</a>
                </span>
				<div title="${hl.imported}">
				  <span class="updated">${hl.updated}</span>
				</div>
				<div class="right">
				  <i class="material-icons icon-score" title="${hl.score}" data-score="${hl.score}"
				  onclick="Article.setScore(${hl.id}, this)">${hl.score_pic}</i>
				  <span onclick="Feeds.open({feed:${hl.feed_id})" style="cursor : pointer" title="${hl.feed_title}">${hl.feed_icon}</span>
				</div>
			  </div>
			`;
			}

			if (row != null) {
				const tmp = document.createElement("div");
				tmp.innerHTML = row;
				dojo.parser.parse(tmp);

				$("headlines-frame").appendChild(tmp.firstChild);
			}
		},
		onLoaded: function (transport, offset) {
			const reply = App.handleRpcJson(transport);

			console.log("Headlines.onLoaded: offset=", offset);

			let is_cat = false;
			let feed_id = false;

			if (reply) {

				if (offset == 0)
					Article.setActive(0);

				is_cat = reply['headlines']['is_cat'];
				feed_id = reply['headlines']['id'];
				Feeds.last_search_query = reply['headlines']['search_query'];

				if (feed_id != -7 && (feed_id != Feeds.getActive() || is_cat != Feeds.activeIsCat()))
					return;

				try {
					if (offset == 0) {
						$("headlines-frame").scrollTop = 0;

						Element.hide("floatingTitle");
						$("floatingTitle").setAttribute("data-article-id", 0);
						$("floatingTitle").innerHTML = "";
					}
				} catch (e) {
				}

				$("headlines-frame").removeClassName("cdm");
				$("headlines-frame").removeClassName("normal");

				$("headlines-frame").addClassName(App.isCombinedMode() ? "cdm" : "normal");

				const headlines_count = reply['headlines-info']['count'];
				Feeds.infscroll_disabled = parseInt(headlines_count) != 30;

				console.log('received', headlines_count, 'headlines, infscroll disabled=', Feeds.infscroll_disabled);

				//this.vgroup_last_feed = reply['headlines-info']['vgroup_last_feed'];
				this.current_first_id = reply['headlines']['first_id'];

				if (offset == 0) {
					this.loaded_article_ids = [];
					this.vgroup_last_feed = undefined;

					dojo.html.set($("toolbar-headlines"),
						reply['headlines']['toolbar'],
						{parseContent: true});

					if (typeof reply['headlines']['content'] == 'string') {
						$("headlines-frame").innerHTML = reply['headlines']['content'];
					} else {
						$("headlines-frame").innerHTML = '';

						for (let i = 0; i < reply['headlines']['content'].length; i++) {
							this.renderHeadline(reply['headlines'], reply['headlines']['content'][i]);
						}
					}

					/* let tmp = document.createElement("div");
					tmp.innerHTML = reply['headlines']['content'];
					dojo.parser.parse(tmp);

					while (tmp.hasChildNodes()) {
						const row = tmp.removeChild(tmp.firstChild);

						if (this.loaded_article_ids.indexOf(row.id) == -1 || row.hasClassName("feed-title")) {
							dijit.byId("headlines-frame").domNode.appendChild(row);

							this.loaded_article_ids.push(row.id);
						}
					} */

					let hsp = $("headlines-spacer");

					if (!hsp) {
						hsp = document.createElement("div");
						hsp.id = "headlines-spacer";
					}

					dijit.byId('headlines-frame').domNode.appendChild(hsp);

					this.initHeadlinesMenu();

					if (Feeds.infscroll_disabled)
						hsp.innerHTML = "<a href='#' onclick='Feeds.openNextUnread()'>" +
							__("Click to open next unread feed.") + "</a>";

					if (Feeds._search_query) {
						$("feed_title").innerHTML += "<span id='cancel_search'>" +
							" (<a href='#' onclick='Feeds.cancelSearch()'>" + __("Cancel search") + "</a>)" +
							"</span>";
					}

				} else if (headlines_count > 0 && feed_id == Feeds.getActive() && is_cat == Feeds.activeIsCat()) {
					const c = dijit.byId("headlines-frame");
					//const ids = Headlines.getSelected();

					let hsp = $("headlines-spacer");

					if (hsp)
						c.domNode.removeChild(hsp);

					/* let tmp = document.createElement("div");
					tmp.innerHTML = reply['headlines']['content'];
					dojo.parser.parse(tmp);

					while (tmp.hasChildNodes()) {
						let row = tmp.removeChild(tmp.firstChild);

						if (this.loaded_article_ids.indexOf(row.id) == -1 || row.hasClassName("feed-title")) {
							dijit.byId("headlines-frame").domNode.appendChild(row);

							this.loaded_article_ids.push(row.id);
						}
					} */

					if (typeof reply['headlines']['content'] == 'string') {
						$("headlines-frame").innerHTML = reply['headlines']['content'];
					} else {
						for (let i = 0; i < reply['headlines']['content'].length; i++) {
							this.renderHeadline(reply['headlines'], reply['headlines']['content'][i]);
						}
					}

					if (!hsp) {
						hsp = document.createElement("div");
						hsp.id = "headlines-spacer";
					}

					c.domNode.appendChild(hsp);

					/* console.log("restore selected ids: " + ids);

					for (let i = 0; i < ids.length; i++) {
						markHeadline(ids[i]);
					} */

					this.initHeadlinesMenu();

					if (Feeds.infscroll_disabled) {
						hsp.innerHTML = "<a href='#' onclick='Feeds.openNextUnread()'>" +
							__("Click to open next unread feed.") + "</a>";
					}

				} else {
					console.log("no new headlines received");

					const first_id_changed = reply['headlines']['first_id_changed'];
					console.log("first id changed:" + first_id_changed);

					let hsp = $("headlines-spacer");

					if (hsp) {
						if (first_id_changed) {
							hsp.innerHTML = "<a href='#' onclick='Feeds.reloadCurrent()'>" +
								__("New articles found, reload feed to continue.") + "</a>";
						} else {
							hsp.innerHTML = "<a href='#' onclick='Feeds.openNextUnread()'>" +
								__("Click to open next unread feed.") + "</a>";
						}
					}
				}

			} else {
				console.error("Invalid object received: " + transport.responseText);
				dijit.byId("headlines-frame").attr('content', "<div class='whiteBox'>" +
					__('Could not update headlines (invalid object received - see error console for details)') +
					"</div>");
			}

			Feeds.infscroll_in_progress = 0;

			// this is used to auto-catchup articles if needed after infscroll request has finished,
			// unpack visible articles, fill buffer more, etc
			this.scrollHandler();

			Notify.close();
		},
		reverse: function () {
			const toolbar = document.forms["toolbar-main"];
			const order_by = dijit.getEnclosingWidget(toolbar.order_by);

			let value = order_by.attr('value');

			if (value == "date_reverse")
				value = "default";
			else
				value = "date_reverse";

			order_by.attr('value', value);

			Feeds.reloadCurrent();
		},
		selectionToggleUnread: function (params) {
			params = params || {};

			const cmode = params.cmode || 2;
			const callback = params.callback;
			const no_error = params.no_error || false;
			const ids = params.ids || Headlines.getSelected();

			if (ids.length == 0) {
				if (!no_error)
					alert(__("No articles selected."));

				return;
			}

			ids.each((id) => {
				const row = $("RROW-" + id);

				if (row) {
					switch (cmode) {
						case 0:
							row.removeClassName("Unread");
							break;
						case 1:
							row.addClassName("Unread");
							break;
						case 2:
							row.toggleClassName("Unread");
					}
				}
			});

			const query = {
				op: "rpc", method: "catchupSelected",
				cmode: cmode, ids: ids.toString()
			};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
				if (callback) callback(transport);
				Headlines.updateFloatingTitle(true);
			});
		},
		selectionToggleMarked: function (ids) {
			const rows = ids || Headlines.getSelected();

			if (rows.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			for (let i = 0; i < rows.length; i++) {
				this.toggleMark(rows[i], true, true);
			}

			const query = {
				op: "rpc", method: "markSelected",
				ids: rows.toString(), cmode: 2
			};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
			});
		},
		selectionTogglePublished: function (ids) {
			const rows = ids || Headlines.getSelected();

			if (rows.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			for (let i = 0; i < rows.length; i++) {
				this.togglePub(rows[i], true);
			}

			if (rows.length > 0) {
				const query = {
					op: "rpc", method: "publishSelected",
					ids: rows.toString(), cmode: 2
				};

				xhrPost("backend.php", query, (transport) => {
					App.handleRpcJson(transport);
				});
			}
		},
		toggleMark: function (id, client_only) {
			const query = {op: "rpc", id: id, method: "mark"};
			const row = $("RROW-" + id);

			if (row) {
				row.toggleClassName("marked");
				query.mark = row.hasClassName("marked") ? 1 : 0;

				Headlines.updateFloatingTitle(true);

				if (!client_only)
					xhrPost("backend.php", query, (transport) => {
						App.handleRpcJson(transport);
					});
			}
		},
		togglePub: function (id, client_only) {
			const row = $("RROW-" + id);

			if (row) {
				const query = {op: "rpc", id: id, method: "publ"};

				row.toggleClassName("published");
				query.pub = row.hasClassName("published") ? 1 : 0;

				Headlines.updateFloatingTitle(true);

				if (!client_only)
					xhrPost("backend.php", query, (transport) => {
						App.handleRpcJson(transport);
					});

			}
		},
		move: function (mode, noscroll, noexpand) {
			const rows = Headlines.getLoaded();

			let prev_id = false;
			let next_id = false;

			if (!$('RROW-' + Article.getActive())) {
				Article.setActive(0);
			}

			if (!Article.getActive()) {
				next_id = rows[0];
				prev_id = rows[rows.length - 1]
			} else {
				for (let i = 0; i < rows.length; i++) {
					if (rows[i] == Article.getActive()) {

						// Account for adjacent identical article ids.
						if (i > 0) prev_id = rows[i - 1];

						for (let j = i + 1; j < rows.length; j++) {
							if (rows[j] != Article.getActive()) {
								next_id = rows[j];
								break;
							}
						}
						break;
					}
				}
			}

			console.log("cur: " + Article.getActive() + " next: " + next_id);

			if (mode == "next") {
				if (next_id || Article.getActive()) {
					if (App.isCombinedMode()) {

						const article = $("RROW-" + Article.getActive());
						const ctr = $("headlines-frame");

						if (!noscroll && article && article.offsetTop + article.offsetHeight >
							ctr.scrollTop + ctr.offsetHeight) {

							Article.scroll(ctr.offsetHeight / 4);

						} else if (next_id) {
							Article.setActive(next_id);
							Article.cdmScrollToId(next_id, true);
						}

					} else if (next_id) {
						Headlines.correctHeadlinesOffset(next_id);
						Article.view(next_id, noexpand);
					}
				}
			}

			if (mode == "prev") {
				if (prev_id || Article.getActive()) {
					if (App.isCombinedMode()) {

						const article = $("RROW-" + Article.getActive());
						const prev_article = $("RROW-" + prev_id);
						const ctr = $("headlines-frame");

						if (!noscroll && article && article.offsetTop < ctr.scrollTop) {
							Article.scroll(-ctr.offsetHeight / 3);
						} else if (!noscroll && prev_article &&
							prev_article.offsetTop < ctr.scrollTop) {
							Article.scroll(-ctr.offsetHeight / 4);
						} else if (prev_id) {
							Article.setActive(prev_id);
							Article.cdmScrollToId(prev_id, noscroll);
						}

					} else if (prev_id) {
						Headlines.correctHeadlinesOffset(prev_id);
						Article.view(prev_id, noexpand);
					}
				}
			}
		},
		updateSelectedPrompt: function () {
			const count = Headlines.getSelected().length;
			const elem = $("selected_prompt");

			if (elem) {
				elem.innerHTML = ngettext("%d article selected",
					"%d articles selected", count).replace("%d", count);

				count > 0 ? Element.show(elem) : Element.hide(elem);
			}
		},
		toggleUnread: function (id, cmode) {
			const row = $("RROW-" + id);

			if (row) {
				const origClassName = row.className;

				if (cmode == undefined) cmode = 2;

				switch (cmode) {
					case 0:
						row.removeClassName("Unread");
						break;
					case 1:
						row.addClassName("Unread");
						break;
					case 2:
						row.toggleClassName("Unread");
						break;
				}

				if (row.className != origClassName)
					xhrPost("backend.php",
						{op: "rpc", method: "catchupSelected", cmode: cmode, ids: id}, (transport) => {
							App.handleRpcJson(transport);
							Headlines.updateFloatingTitle(true);
						});
			}
		},
		selectionRemoveLabel: function (id, ids) {
			if (!ids) ids = Headlines.getSelected();

			if (ids.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			const query = {
				op: "article", method: "removeFromLabel",
				ids: ids.toString(), lid: id
			};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
				this.onLabelsUpdated(transport);
			});
		},
		selectionAssignLabel: function (id, ids) {
			if (!ids) ids = Headlines.getSelected();

			if (ids.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			const query = {
				op: "article", method: "assignToLabel",
				ids: ids.toString(), lid: id
			};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
				this.onLabelsUpdated(transport);
			});
		},
		deleteSelection: function () {
			const rows = Headlines.getSelected();

			if (rows.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			const fn = Feeds.getName(Feeds.getActive(), Feeds.activeIsCat());
			let str;

			if (Feeds.getActive() != 0) {
				str = ngettext("Delete %d selected article in %s?", "Delete %d selected articles in %s?", rows.length);
			} else {
				str = ngettext("Delete %d selected article?", "Delete %d selected articles?", rows.length);
			}

			str = str.replace("%d", rows.length);
			str = str.replace("%s", fn);

			if (App.getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
				return;
			}

			const query = {op: "rpc", method: "delete", ids: rows.toString()};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
				Feeds.reloadCurrent();
			});
		},
		getSelected: function () {
			const rv = [];

			$$("#headlines-frame > div[id*=RROW][class*=Selected]").each(
				function (child) {
					rv.push(child.getAttribute("data-article-id"));
				});

			// consider active article a honorary member of selected articles
			if (Article.getActive())
				rv.push(Article.getActive());

			return rv.uniq();
		},
		getLoaded: function () {
			const rv = [];

			const children = $$("#headlines-frame > div[id*=RROW-]");

			children.each(function (child) {
				if (Element.visible(child)) {
					rv.push(child.getAttribute("data-article-id"));
				}
			});

			return rv;
		},
		onRowChecked: function (elem) {
			const row = elem.domNode.up("div[id*=RROW]");

			// do not allow unchecking active article checkbox
			if (row.hasClassName("active")) {
				elem.attr("checked", 1);
				return;
			}

			if (elem.attr("checked")) {
				row.addClassName("Selected");
			} else {
				row.removeClassName("Selected");
			}

			this.updateSelectedPrompt();
		},
		select: function (mode) {
			// mode = all,none,unread,invert,marked,published
			let query = "#headlines-frame > div[id*=RROW]";

			switch (mode) {
				case "none":
				case "all":
				case "invert":
					break;
				case "marked":
					query += "[class*=marked]";
					break;
				case "published":
					query += "[class*=published]";
					break;
				case "unread":
					query += "[class*=Unread]";
					break;
				default:
					console.warn("select: unknown mode", mode);
			}

			const rows = $$(query);

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				const cb = dijit.getEnclosingWidget(row.select(".rchk")[0]);

				switch (mode) {
					case "none":
						row.removeClassName("Selected");

						if (!row.hasClassName("active"))
							cb.attr("checked", false);
						break;
					case "invert":
						if (row.hasClassName("Selected")) {
							row.removeClassName("Selected");

							if (!row.hasClassName("active"))
								cb.attr("checked", false);
						} else {
							row.addClassName("Selected");
							cb.attr("checked", true);
						}
						break;
					default:
						row.addClassName("Selected");
						cb.attr("checked", true);
				}

				Headlines.updateSelectedPrompt();
			}
		},
		archiveSelection: function () {
			const rows = Headlines.getSelected();

			if (rows.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			const fn = Feeds.getName(Feeds.getActive(), Feeds.activeIsCat());
			let str;
			let op;

			if (Feeds.getActive() != 0) {
				str = ngettext("Archive %d selected article in %s?", "Archive %d selected articles in %s?", rows.length);
				op = "archive";
			} else {
				str = ngettext("Move %d archived article back?", "Move %d archived articles back?", rows.length);
				str += " " + __("Please note that unstarred articles might get purged on next feed update.");

				op = "unarchive";
			}

			str = str.replace("%d", rows.length);
			str = str.replace("%s", fn);

			if (App.getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
				return;
			}

			for (let i = 0; i < rows.length; i++) {
				ArticleCache.del(rows[i]);
			}

			const query = {op: "rpc", method: op, ids: rows.toString()};

			xhrPost("backend.php", query, (transport) => {
				App.handleRpcJson(transport);
				Feeds.reloadCurrent();
			});
		},
		catchupSelection: function () {
			const rows = Headlines.getSelected();

			if (rows.length == 0) {
				alert(__("No articles selected."));
				return;
			}

			const fn = Feeds.getName(Feeds.getActive(), Feeds.activeIsCat());

			let str = ngettext("Mark %d selected article in %s as read?", "Mark %d selected articles in %s as read?", rows.length);

			str = str.replace("%d", rows.length);
			str = str.replace("%s", fn);

			if (App.getInitParam("confirm_feed_catchup") == 1 && !confirm(str)) {
				return;
			}

			Headlines.selectionToggleUnread({callback: Feeds.reloadCurrent, no_error: 1});
		},
		catchupBatched: function (callback) {
			console.log("catchupBatched, size=", this.catchup_id_batch.length);

			if (this.catchup_id_batch.length > 0) {

				// make a copy of the array
				const batch = this.catchup_id_batch.slice();
				const query = {
					op: "rpc", method: "catchupSelected",
					cmode: 0, ids: batch.toString()
				};

				xhrPost("backend.php", query, (transport) => {
					const reply = App.handleRpcJson(transport);

					if (reply) {
						const batch = reply.ids;

						batch.each(function (id) {
							const elem = $("RROW-" + id);
							if (elem) elem.removeClassName("Unread");
							Headlines.catchup_id_batch.remove(id);
						});
					}

					Headlines.updateFloatingTitle(true);

					if (callback) callback();
				});
			} else {
				if (callback) callback();
			}
		},
		catchupRelativeTo: function (below, id) {

			if (!id) id = Article.getActive();

			if (!id) {
				alert(__("No article is selected."));
				return;
			}

			const visible_ids = this.getLoaded();

			const ids_to_mark = [];

			if (!below) {
				for (let i = 0; i < visible_ids.length; i++) {
					if (visible_ids[i] != id) {
						const e = $("RROW-" + visible_ids[i]);

						if (e && e.hasClassName("Unread")) {
							ids_to_mark.push(visible_ids[i]);
						}
					} else {
						break;
					}
				}
			} else {
				for (let i = visible_ids.length - 1; i >= 0; i--) {
					if (visible_ids[i] != id) {
						const e = $("RROW-" + visible_ids[i]);

						if (e && e.hasClassName("Unread")) {
							ids_to_mark.push(visible_ids[i]);
						}
					} else {
						break;
					}
				}
			}

			if (ids_to_mark.length == 0) {
				alert(__("No articles found to mark"));
			} else {
				const msg = ngettext("Mark %d article as read?", "Mark %d articles as read?", ids_to_mark.length).replace("%d", ids_to_mark.length);

				if (App.getInitParam("confirm_feed_catchup") != 1 || confirm(msg)) {

					for (var i = 0; i < ids_to_mark.length; i++) {
						var e = $("RROW-" + ids_to_mark[i]);
						e.removeClassName("Unread");
					}

					const query = {
						op: "rpc", method: "catchupSelected",
						cmode: 0, ids: ids_to_mark.toString()
					};

					xhrPost("backend.php", query, (transport) => {
						App.handleRpcJson(transport);
					});
				}
			}
		},
		onLabelsUpdated: function (transport) {
			const data = JSON.parse(transport.responseText);

			if (data) {
				data['info-for-headlines'].each(function (elem) {
					$$(".HLLCTR-" + elem.id).each(function (ctr) {
						ctr.innerHTML = elem.labels;
					});
				});
			}
		},
		onActionChanged: function (elem) {
			eval(elem.value);
			elem.attr('value', 'false');
		},
		correctHeadlinesOffset: function (id) {
			const container = $("headlines-frame");
			const row = $("RROW-" + id);

			if (!container || !row) return;

			const viewport = container.offsetHeight;

			const rel_offset_top = row.offsetTop - container.scrollTop;
			const rel_offset_bottom = row.offsetTop + row.offsetHeight - container.scrollTop;

			//console.log("Rtop: " + rel_offset_top + " Rbtm: " + rel_offset_bottom);
			//console.log("Vport: " + viewport);

			if (rel_offset_top <= 0 || rel_offset_top > viewport) {
				container.scrollTop = row.offsetTop;
			} else if (rel_offset_bottom > viewport) {
				container.scrollTop = row.offsetTop + row.offsetHeight - viewport;
			}
		},
		initFloatingMenu: function () {
			if (!dijit.byId("floatingMenu")) {

				const menu = new dijit.Menu({
					id: "floatingMenu",
					selector: ".hlMenuAttach",
					targetNodeIds: ["floatingTitle"]
				});

				this.headlinesMenuCommon(menu);

				menu.startup();
			}
		},
		headlinesMenuCommon: function (menu) {

			menu.addChild(new dijit.MenuItem({
				label: __("Open original article"),
				onClick: function (event) {
					Article.openInNewWindow(this.getParent().currentTarget.getAttribute("data-article-id"));
				}
			}));

			menu.addChild(new dijit.MenuItem({
				label: __("Display article URL"),
				onClick: function (event) {
					Article.displayUrl(this.getParent().currentTarget.getAttribute("data-article-id"));
				}
			}));

			menu.addChild(new dijit.MenuSeparator());

			menu.addChild(new dijit.MenuItem({
				label: __("Toggle unread"),
				onClick: function () {

					let ids = Headlines.getSelected();
					// cast to string
					const id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
					ids = ids.length != 0 && ids.indexOf(id) != -1 ? ids : [id];

					Headlines.selectionToggleUnread({ids: ids, no_error: 1});
				}
			}));

			menu.addChild(new dijit.MenuItem({
				label: __("Toggle starred"),
				onClick: function () {
					let ids = Headlines.getSelected();
					// cast to string
					const id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
					ids = ids.length != 0 && ids.indexOf(id) != -1 ? ids : [id];

					Headlines.selectionToggleMarked(ids);
				}
			}));

			menu.addChild(new dijit.MenuItem({
				label: __("Toggle published"),
				onClick: function () {
					let ids = Headlines.getSelected();
					// cast to string
					const id = (this.getParent().currentTarget.getAttribute("data-article-id")) + "";
					ids = ids.length != 0 && ids.indexOf(id) != -1 ? ids : [id];

					Headlines.selectionTogglePublished(ids);
				}
			}));

			menu.addChild(new dijit.MenuSeparator());

			menu.addChild(new dijit.MenuItem({
				label: __("Mark above as read"),
				onClick: function () {
					Headlines.catchupRelativeTo(0, this.getParent().currentTarget.getAttribute("data-article-id"));
				}
			}));

			menu.addChild(new dijit.MenuItem({
				label: __("Mark below as read"),
				onClick: function () {
					Headlines.catchupRelativeTo(1, this.getParent().currentTarget.getAttribute("data-article-id"));
				}
			}));


			const labels = App.getInitParam("labels");

			if (labels && labels.length) {

				menu.addChild(new dijit.MenuSeparator());

				const labelAddMenu = new dijit.Menu({ownerMenu: menu});
				const labelDelMenu = new dijit.Menu({ownerMenu: menu});

				labels.each(function (label) {
					const bare_id = label.id;
					const name = label.caption;

					labelAddMenu.addChild(new dijit.MenuItem({
						label: name,
						labelId: bare_id,
						onClick: function () {

							let ids = Headlines.getSelected();
							// cast to string
							const id = (this.getParent().ownerMenu.currentTarget.getAttribute("data-article-id")) + "";

							ids = ids.length != 0 && ids.indexOf(id) != -1 ? ids : [id];

							Headlines.selectionAssignLabel(this.labelId, ids);
						}
					}));

					labelDelMenu.addChild(new dijit.MenuItem({
						label: name,
						labelId: bare_id,
						onClick: function () {
							let ids = Headlines.getSelected();
							// cast to string
							const id = (this.getParent().ownerMenu.currentTarget.getAttribute("data-article-id")) + "";

							ids = ids.length != 0 && ids.indexOf(id) != -1 ? ids : [id];

							Headlines.selectionRemoveLabel(this.labelId, ids);
						}
					}));

				});

				menu.addChild(new dijit.PopupMenuItem({
					label: __("Assign label"),
					popup: labelAddMenu
				}));

				menu.addChild(new dijit.PopupMenuItem({
					label: __("Remove label"),
					popup: labelDelMenu
				}));

			}
		},
		initHeadlinesMenu: function () {
			if (!dijit.byId("headlinesMenu")) {

				const menu = new dijit.Menu({
					id: "headlinesMenu",
					targetNodeIds: ["headlines-frame"],
					selector: ".hlMenuAttach"
				});

				this.headlinesMenuCommon(menu);

				menu.startup();
			}

			/* vgroup feed title menu */

			if (!dijit.byId("headlinesFeedTitleMenu")) {

				const menu = new dijit.Menu({
					id: "headlinesFeedTitleMenu",
					targetNodeIds: ["headlines-frame"],
					selector: "div.cdmFeedTitle"
				});

				menu.addChild(new dijit.MenuItem({
					label: __("Select articles in group"),
					onClick: function (event) {
						Headlines.select("all",
							"#headlines-frame > div[id*=RROW]" +
							"[data-orig-feed-id='" + this.getParent().currentTarget.getAttribute("data-feed-id") + "']");

					}
				}));

				menu.addChild(new dijit.MenuItem({
					label: __("Mark group as read"),
					onClick: function () {
						Headlines.select("none");
						Headlines.select("all",
							"#headlines-frame > div[id*=RROW]" +
							"[data-orig-feed-id='" + this.getParent().currentTarget.getAttribute("data-feed-id") + "']");

						Headlines.catchupSelection();
					}
				}));

				menu.addChild(new dijit.MenuItem({
					label: __("Mark feed as read"),
					onClick: function () {
						Feeds.catchupFeedInGroup(this.getParent().currentTarget.getAttribute("data-feed-id"));
					}
				}));

				menu.addChild(new dijit.MenuItem({
					label: __("Edit feed"),
					onClick: function () {
						CommonDialogs.editFeed(this.getParent().currentTarget.getAttribute("data-feed-id"));
					}
				}));

				menu.startup();
			}
		}
	}

	return Headlines;
});