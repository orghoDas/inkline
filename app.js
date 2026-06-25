const state = {
  stories: [],
  user: null,
  feedMode: "latest",
  activeFilter: "all",
  activeStory: null,
  activeAuthor: null,
  editorImageData: "",
  editingStoryId: null,
  editingStoryStatus: "published",
  submittingStatus: "published",
  drafts: [],
  nextCursor: null,
  nextOffset: null,
  hasMore: false,
  loadingMore: false,
  searchQuery: "",
  searchTimer: null,
  followedAuthors: new Map(),
  followedTopics: new Set(),
  notifications: [],
  unreadNotificationCount: 0,
  adminModeration: {
    responses: [],
    stories: [],
    diagnostics: []
  },
  pageSize: 3
};

const defaultCoverImage = "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80";

const elements = {
  authButton: document.querySelector("#authButton"),
  notificationsButton: document.querySelector("#notificationsButton"),
  notificationCount: document.querySelector("#notificationCount"),
  signOutButton: document.querySelector("#signOutButton"),
  userPill: document.querySelector("#userPill"),
  userName: document.querySelector("#userName"),
  adminButton: document.querySelector("#adminButton"),
  settingsButton: document.querySelector("#settingsButton"),
  openWriteButton: document.querySelector("#openWriteButton"),
  openSavedButton: document.querySelector("#openSavedButton"),
  startReadingButton: document.querySelector("#startReadingButton"),
  loadMoreButton: document.querySelector("#loadMoreButton"),
  featuredStory: document.querySelector("#featuredStory"),
  storyList: document.querySelector("#storyList"),
  emptyState: document.querySelector("#emptyState"),
  feedEyebrow: document.querySelector("#feedEyebrow"),
  feedTitle: document.querySelector("#feedTitle"),
  topicList: document.querySelector("#topicList"),
  authorList: document.querySelector("#authorList"),
  searchInput: document.querySelector("#searchInput"),
  filterTabs: document.querySelectorAll("[data-filter]"),
  feedTabs: document.querySelectorAll("[data-feed]"),
  readerDialog: document.querySelector("#readerDialog"),
  authorDialog: document.querySelector("#authorDialog"),
  notificationsDialog: document.querySelector("#notificationsDialog"),
  writeDialog: document.querySelector("#writeDialog"),
  authDialog: document.querySelector("#authDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  adminDialog: document.querySelector("#adminDialog"),
  resetDialog: document.querySelector("#resetDialog"),
  writeForm: document.querySelector("#writeForm"),
  authForm: document.querySelector("#authForm"),
  settingsForm: document.querySelector("#settingsForm"),
  resetForm: document.querySelector("#resetForm"),
  responseForm: document.querySelector("#responseForm"),
  readerImage: document.querySelector("#readerImage"),
  readerTopic: document.querySelector("#readerTopic"),
  readerTitle: document.querySelector("#readerTitle"),
  readerMeta: document.querySelector("#readerMeta"),
  readerBody: document.querySelector("#readerBody"),
  authorButton: document.querySelector("#authorButton"),
  clapButton: document.querySelector("#clapButton"),
  bookmarkButton: document.querySelector("#bookmarkButton"),
  editStoryButton: document.querySelector("#editStoryButton"),
  deleteStoryButton: document.querySelector("#deleteStoryButton"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  ownerActions: document.querySelector("#ownerActions"),
  responseTitle: document.querySelector("#responseTitle"),
  responseList: document.querySelector("#responseList"),
  responseName: document.querySelector("#responseName"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileName: document.querySelector("#profileName"),
  profileBio: document.querySelector("#profileBio"),
  profileFollowButton: document.querySelector("#profileFollowButton"),
  profileStats: document.querySelector("#profileStats"),
  profileStoryList: document.querySelector("#profileStoryList"),
  draftsPanel: document.querySelector("#draftsPanel"),
  draftList: document.querySelector("#draftList"),
  writeTitle: document.querySelector("#writeTitle"),
  writeSubmitButton: document.querySelector("#writeSubmitButton"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  titleInput: document.querySelector("#titleInput"),
  excerptInput: document.querySelector("#excerptInput"),
  topicInput: document.querySelector("#topicInput"),
  imageUrlInput: document.querySelector("#imageUrlInput"),
  imageFileInput: document.querySelector("#imageFileInput"),
  coverPreview: document.querySelector("#coverPreview"),
  richEditor: document.querySelector("#richEditor"),
  editorToolbar: document.querySelector("#editorToolbar"),
  editorCount: document.querySelector("#editorCount"),
  authTitle: document.querySelector("#authTitle"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authModeInput: document.querySelector("#authModeInput"),
  authNameField: document.querySelector("#authNameField"),
  authBioField: document.querySelector("#authBioField"),
  authNameInput: document.querySelector("#authNameInput"),
  authEmailInput: document.querySelector("#authEmailInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  authBioInput: document.querySelector("#authBioInput"),
  authToggleButton: document.querySelector("#authToggleButton"),
  forgotPasswordButton: document.querySelector("#forgotPasswordButton"),
  authError: document.querySelector("#authError"),
  authDevLink: document.querySelector("#authDevLink"),
  settingsNameInput: document.querySelector("#settingsNameInput"),
  settingsEmailInput: document.querySelector("#settingsEmailInput"),
  settingsBioInput: document.querySelector("#settingsBioInput"),
  settingsVerificationNote: document.querySelector("#settingsVerificationNote"),
  settingsError: document.querySelector("#settingsError"),
  settingsDevLink: document.querySelector("#settingsDevLink"),
  requestVerificationButton: document.querySelector("#requestVerificationButton"),
  adminResponseList: document.querySelector("#adminResponseList"),
  adminStoryList: document.querySelector("#adminStoryList"),
  adminDiagnosticList: document.querySelector("#adminDiagnosticList"),
  notificationList: document.querySelector("#notificationList"),
  markNotificationsReadButton: document.querySelector("#markNotificationsReadButton"),
  resetTokenInput: document.querySelector("#resetTokenInput"),
  resetEmailInput: document.querySelector("#resetEmailInput"),
  resetPasswordInput: document.querySelector("#resetPasswordInput"),
  requestResetButton: document.querySelector("#requestResetButton"),
  resetError: document.querySelector("#resetError"),
  resetDevLink: document.querySelector("#resetDevLink"),
  publishedCount: document.querySelector("#publishedCount"),
  bookmarkCount: document.querySelector("#bookmarkCount"),
  clapCount: document.querySelector("#clapCount"),
  responseCount: document.querySelector("#responseCount"),
  draftCount: document.querySelector("#draftCount")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    credentials: "same-origin",
    ...options
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(data?.error ?? "Something went wrong.");
  }

  return data;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function getPlainTextFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent.replace(/\s+/g, " ").trim();
}

function estimateReadingTimeFromHtml(html) {
  const words = getPlainTextFromHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function getStoryUrl(story) {
  return `/stories/${story.id}/${story.slug}`;
}

function getAuthorInitials(author) {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function isAuthorFollowed(authorKey) {
  return state.followedAuthors.has(authorKey);
}

function syncStoryFollowState() {
  state.stories = state.stories.map((story) => ({
    ...story,
    authorFollowed: isAuthorFollowed(story.authorKey),
    topicFollowed: state.followedTopics.has(story.topic)
  }));

  if (state.activeStory) {
    state.activeStory = {
      ...state.activeStory,
      authorFollowed: isAuthorFollowed(state.activeStory.authorKey),
      topicFollowed: state.followedTopics.has(state.activeStory.topic)
    };
  }
}

function getVisibleStories() {
  return state.stories.filter((story) => {
    const matchesFilter =
      state.activeFilter === "all" ||
      (state.activeFilter === "bookmarks" && story.bookmarked) ||
      story.topic === state.activeFilter;
    return matchesFilter;
  });
}

function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);

  if (options.className) {
    element.className = options.className;
  }

  if (options.text !== undefined) {
    element.textContent = options.text;
  }

  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
  }

  return element;
}

function showDevLink(target, devEmail) {
  target.replaceChildren();

  if (!devEmail?.link) {
    target.textContent = "";
    return;
  }

  target.append(
    createElement("span", { text: "Dev email link: " }),
    createElement("a", {
      text: devEmail.link,
      attrs: {
        href: devEmail.link
      }
    })
  );
}

function createStoryLink(story, options = {}) {
  const card = createElement("a", {
    className: "story-card",
    attrs: {
      href: getStoryUrl(story),
      "data-story-id": story.id
    }
  });

  const copy = createElement("div");
  const meta = createElement("p", {
    className: "story-meta",
    text: `${story.authorName} | ${story.dateLabel} | ${story.minutes} min read`
  });
  const title = createElement("h3", { text: story.title });
  const excerpt = createElement("p", { text: story.excerpt });
  const footer = createElement("div", { className: "story-footer" });
  const topic = createElement("span", { className: "topic-pill", text: story.topic });
  const claps = createElement("span", { text: `${story.claps} claps` });
  const bookmark = createElement("span", { text: story.bookmarked ? "Bookmarked" : "Save for later" });
  const responses = createElement("span", {
    text: `${story.responseCount} response${story.responseCount === 1 ? "" : "s"}`
  });

  footer.append(topic, claps, bookmark, responses);

  if (story.canEdit) {
    footer.append(createElement("span", { className: "owner-badge", text: "Your story" }));
  }

  if (story.recommendationReason) {
    copy.append(createElement("p", { className: "recommendation-reason", text: story.recommendationReason }));
  }
  copy.append(meta, title, excerpt, footer);

  const image = createElement("img", {
    attrs: {
      src: story.image || defaultCoverImage,
      alt: "",
      loading: options.featured ? "eager" : "lazy"
    }
  });

  card.append(copy, image);
  card.addEventListener("click", (event) => {
    event.preventDefault();
    options.beforeOpen?.();
    navigateToStory(story.id);
  });

  return card;
}

function renderStories() {
  const stories = getVisibleStories();
  elements.featuredStory.replaceChildren();
  elements.storyList.replaceChildren();
  elements.emptyState.hidden = stories.length > 0;
  elements.emptyState.textContent = state.searchQuery
    ? "No stories match that search."
    : state.feedMode === "following"
      ? "Follow authors or topics to build this feed."
      : "No stories match that filter.";
  elements.loadMoreButton.hidden = !state.hasMore || state.activeFilter !== "all";
  elements.loadMoreButton.textContent = state.loadingMore ? "Loading..." : "Load more";

  if (stories.length === 0) {
    return;
  }

  elements.featuredStory.append(createStoryLink(stories[0], { featured: true }));
  stories.slice(1).forEach((story) => {
    elements.storyList.append(createStoryLink(story));
  });
}

function createDraftButton(draft) {
  const button = createElement("button", {
    className: "draft-button",
    attrs: { type: "button" }
  });
  const title = createElement("strong", { text: draft.title });
  const meta = createElement("span", { text: `${draft.topic} | Updated ${draft.dateLabel}` });

  button.append(title, meta);
  button.addEventListener("click", async () => {
    const { story } = await api(`/api/stories/${encodeURIComponent(draft.id)}`);
    openWriteDialog(story);
  });
  return button;
}

function renderDrafts() {
  elements.draftsPanel.hidden = !state.user;
  elements.draftList.replaceChildren();

  if (!state.user) return;

  if (state.drafts.length === 0) {
    elements.draftList.append(createElement("p", { className: "empty-state compact-empty", text: "No drafts yet." }));
    return;
  }

  state.drafts.forEach((draft) => {
    elements.draftList.append(createDraftButton(draft));
  });
}

function renderTopics() {
  const topics = ["all", ...new Set(["Design", "Code", "Life", "Writing", ...state.stories.map((story) => story.topic)])];
  elements.topicList.replaceChildren();

  topics.forEach((topic) => {
    const row = createElement("div", { className: "topic-row" });
    const button = createElement("button", {
      className: `topic-button${topic === state.activeFilter ? " is-active" : ""}`,
      text: topic === "all" ? "All topics" : topic,
      attrs: { type: "button" }
    });

    button.addEventListener("click", () => setFilter(topic));
    row.append(button);

    if (topic !== "all") {
      const follow = createElement("button", {
        className: `compact-follow-button${state.followedTopics.has(topic) ? " is-followed" : ""}`,
        text: state.followedTopics.has(topic) ? "Following" : "Follow",
        attrs: {
          type: "button",
          "aria-label": `${state.followedTopics.has(topic) ? "Unfollow" : "Follow"} ${topic}`
        }
      });
      follow.addEventListener("click", () => toggleTopicFollow(topic));
      row.append(follow);
    }

    elements.topicList.append(row);
  });
}

function renderAuthors() {
  const authorMap = state.stories.reduce((authors, story) => {
    const key = story.authorKey;
    const author = authors.get(key) ?? {
      key,
      name: story.authorName,
      bio: story.authorBio,
      count: 0
    };

    author.count += 1;
    authors.set(key, author);
    return authors;
  }, new Map());

  const authors = [...authorMap.values()]
    .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name))
    .slice(0, 5);

  elements.authorList.replaceChildren();

  authors.forEach((author) => {
    const row = createElement("div", { className: "author-row" });
    const button = createElement("button", {
      className: "author-button",
      attrs: { type: "button" }
    });
    const avatar = createElement("span", { className: "mini-avatar", text: getAuthorInitials(author.name) });
    const copy = createElement("span", { className: "author-button-copy" });
    const name = createElement("strong", { text: author.name });
    const meta = createElement("span", { text: `${author.count} stor${author.count === 1 ? "y" : "ies"}` });

    copy.append(name, meta);
    button.append(avatar, copy);
    button.addEventListener("click", () => openAuthorProfile(author.key));
    row.append(button);

    if (author.key !== `user-${state.user?.id}`) {
      const follow = createElement("button", {
        className: `compact-follow-button${isAuthorFollowed(author.key) ? " is-followed" : ""}`,
        text: isAuthorFollowed(author.key) ? "Following" : "Follow",
        attrs: {
          type: "button",
          "aria-label": `${isAuthorFollowed(author.key) ? "Unfollow" : "Follow"} ${author.name}`
        }
      });
      follow.addEventListener("click", () => toggleAuthorFollow(author.key, author.name));
      row.append(follow);
    }

    elements.authorList.append(row);
  });
}

function renderStats() {
  const ownedStories = state.stories.filter((story) => story.canEdit).length;
  const bookmarks = state.stories.filter((story) => story.bookmarked).length;
  const claps = state.stories.reduce((sum, story) => sum + story.claps, 0);
  const responses = state.stories.reduce((sum, story) => sum + story.responseCount, 0);

  elements.publishedCount.textContent = ownedStories;
  elements.bookmarkCount.textContent = bookmarks;
  elements.clapCount.textContent = claps;
  elements.responseCount.textContent = responses;
  elements.draftCount.textContent = state.drafts.length;
}

function renderSession() {
  elements.userPill.hidden = !state.user;
  elements.authButton.hidden = Boolean(state.user);
  elements.notificationsButton.hidden = !state.user;
  elements.adminButton.hidden = !state.user?.isAdmin;
  elements.settingsButton.hidden = !state.user;
  elements.signOutButton.hidden = !state.user;
  elements.userName.textContent = state.user?.name ?? "";
  elements.responseName.value = state.user?.name ?? "";
  elements.notificationCount.textContent = String(state.unreadNotificationCount);
  elements.notificationCount.hidden = !state.user || state.unreadNotificationCount === 0;
}

function renderFeedNavigation() {
  const headings = {
    latest: ["Latest", "Recommended for you"],
    "for-you": ["Personalized", "Picked for you"],
    following: ["Following", "From authors and topics you follow"]
  };
  const [eyebrow, title] = headings[state.feedMode];
  elements.feedEyebrow.textContent = eyebrow;
  elements.feedTitle.textContent = title;

  elements.filterTabs.forEach((tab) => {
    tab.classList.toggle("is-active", state.feedMode === "latest" && tab.dataset.filter === state.activeFilter);
  });
  elements.feedTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.feed === state.feedMode);
  });
}

function render() {
  renderSession();
  renderFeedNavigation();
  renderStories();
  renderDrafts();
  renderTopics();
  renderAuthors();
  renderStats();
}

async function refreshStories() {
  state.searchQuery = elements.searchInput.value.trim();
  const params = new URLSearchParams({ limit: String(state.pageSize) });
  if (state.searchQuery) {
    params.set("search", state.searchQuery);
  } else if (state.feedMode !== "latest") {
    params.set("feed", state.feedMode);
  }

  const { stories, nextCursor, nextOffset, hasMore } = await api(`/api/stories?${params}`);
  state.stories = stories;
  state.nextCursor = nextCursor;
  state.nextOffset = nextOffset;
  state.hasMore = hasMore;
  render();
}

async function loadMoreStories() {
  if (!state.hasMore || state.loadingMore) return;

  state.loadingMore = true;
  renderStories();

  const params = new URLSearchParams({ limit: String(state.pageSize) });
  if (state.searchQuery) {
    params.set("search", state.searchQuery);
    params.set("offset", String(state.nextOffset ?? state.stories.length));
  } else if (state.feedMode !== "latest") {
    params.set("feed", state.feedMode);
    params.set("offset", String(state.nextOffset ?? state.stories.length));
  } else if (state.nextCursor) {
    params.set("cursor", state.nextCursor);
  }

  const { stories, nextCursor, nextOffset, hasMore } = await api(`/api/stories?${params}`);

  const knownIds = new Set(state.stories.map((story) => story.id));
  state.stories = [...state.stories, ...stories.filter((story) => !knownIds.has(story.id))];
  state.nextCursor = nextCursor;
  state.nextOffset = nextOffset;
  state.hasMore = hasMore;
  state.loadingMore = false;
  render();
}

async function refreshDrafts() {
  if (!state.user) {
    state.drafts = [];
    renderDrafts();
    return;
  }

  const { drafts } = await api("/api/me/drafts");
  state.drafts = drafts;
  renderDrafts();
  renderStats();
}

async function refreshSession() {
  const { user } = await api("/api/session");
  state.user = user;
  renderSession();
}

async function refreshFollows() {
  if (!state.user) {
    state.followedAuthors = new Map();
    state.followedTopics = new Set();
    syncStoryFollowState();
    return;
  }

  const { authors, topics } = await api("/api/follows");
  state.followedAuthors = new Map(authors.map((follow) => [follow.authorKey, follow.authorName]));
  state.followedTopics = new Set(topics.map((follow) => follow.topic));
  syncStoryFollowState();
}

async function refreshNotifications() {
  if (!state.user) {
    state.notifications = [];
    state.unreadNotificationCount = 0;
    renderSession();
    return;
  }

  const { notifications, unreadCount } = await api("/api/notifications");
  state.notifications = notifications;
  state.unreadNotificationCount = unreadCount;
  renderSession();
}

async function setFilter(filter) {
  const changedFeed = state.feedMode !== "latest";
  state.feedMode = "latest";
  state.activeFilter = filter;

  if (changedFeed) {
    await refreshStories();
  } else {
    render();
  }
}

async function setFeedMode(feedMode) {
  if (!requireUser("view your personalized feed")) return;

  state.feedMode = feedMode;
  state.activeFilter = "all";
  elements.searchInput.value = "";
  state.searchQuery = "";
  await refreshStories();
}

function requireUser(action) {
  if (state.user) {
    return true;
  }

  openAuthDialog("signin");
  elements.authError.textContent = action ? `Sign in to ${action}.` : "Sign in to continue.";
  return false;
}

function renderSanitizedHtml(html, target) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  target.replaceChildren(...Array.from(doc.body.childNodes).map((node) => document.importNode(node, true)));
}

async function navigateToStory(storyId, options = {}) {
  const story = state.stories.find((candidate) => candidate.id === storyId);
  if (story && !options.skipPush) {
    history.pushState({ storyId }, "", getStoryUrl(story));
  }

  await openStory(storyId);
}

async function openStory(storyId) {
  const { story } = await api(`/api/stories/${encodeURIComponent(storyId)}`);
  state.activeStory = story;
  upsertStory(story);

  elements.readerImage.src = story.image || defaultCoverImage;
  elements.readerImage.alt = "";
  elements.readerTopic.textContent = story.topic;
  elements.readerTitle.textContent = story.title;
  elements.readerMeta.textContent = `${story.authorName} | ${story.dateLabel} | ${story.minutes} min read`;
  elements.authorButton.textContent = `View ${story.authorName}`;
  elements.ownerActions.hidden = !story.canEdit;
  renderSanitizedHtml(story.bodyHtml, elements.readerBody);
  updateReaderActions(story);
  renderResponses(story.responses);
  render();
  elements.readerDialog.showModal();
}

function upsertStory(story) {
  const index = state.stories.findIndex((candidate) => candidate.id === story.id);
  const summary = {
    ...story,
    responses: undefined
  };

  if (index === -1) {
    state.stories = [summary, ...state.stories];
    return;
  }

  state.stories[index] = {
    ...state.stories[index],
    ...summary
  };
}

function updateReaderActions(story) {
  elements.clapButton.textContent = `Clap (${story.claps})`;
  elements.bookmarkButton.textContent = story.bookmarked ? "Bookmarked" : "Bookmark";
}

function renderResponses(responses) {
  elements.responseTitle.textContent = `${responses.length} response${responses.length === 1 ? "" : "s"}`;
  elements.responseList.replaceChildren();

  if (responses.length === 0) {
    elements.responseList.append(createElement("p", { className: "empty-state compact-empty", text: "No responses yet." }));
    return;
  }

  responses.forEach((response) => {
    const article = createElement("article", {
      className: `response-card${response.status === "hidden" ? " is-hidden" : ""}`
    });
    const meta = createElement("p", {
      className: "response-meta",
      text: `${response.name} | ${response.dateLabel}`
    });
    const text = createElement("p", { text: response.text });
    const actions = createElement("div", { className: "response-actions" });

    if (response.canModerate) {
      const moderate = createElement("button", {
        className: "link-button",
        text: response.status === "hidden" ? "Show" : "Hide",
        attrs: { type: "button" }
      });
      moderate.addEventListener("click", () =>
        moderateResponse(response.id, response.status === "hidden" ? "visible" : "hidden")
      );
      actions.append(moderate);
    }

    if (response.canDelete) {
      const remove = createElement("button", {
        className: "link-button danger-link",
        text: "Delete",
        attrs: { type: "button" }
      });
      remove.addEventListener("click", () => deleteResponse(response.id));
      actions.append(remove);
    }

    article.append(meta, text);
    if (actions.children.length > 0) {
      article.append(actions);
    }
    elements.responseList.append(article);
  });
}

async function toggleAuthorFollow(authorKey, authorName) {
  if (!requireUser(`follow ${authorName}`)) return;

  const result = await api("/api/follows/authors", {
    method: "POST",
    body: JSON.stringify({ authorKey, authorName })
  });

  if (result.followed) {
    state.followedAuthors.set(result.authorKey, result.authorName);
  } else {
    state.followedAuthors.delete(result.authorKey);
  }
  syncStoryFollowState();

  if (state.activeAuthor === result.authorKey) {
    elements.profileFollowButton.textContent = result.followed ? "Following" : "Follow";
    elements.profileFollowButton.classList.toggle("is-followed", result.followed);
  }

  if (state.feedMode !== "latest") {
    await refreshStories();
  } else {
    render();
  }
}

async function toggleTopicFollow(topic) {
  if (!requireUser(`follow ${topic}`)) return;

  const result = await api("/api/follows/topics", {
    method: "POST",
    body: JSON.stringify({ topic })
  });

  if (result.followed) {
    state.followedTopics.add(result.topic);
  } else {
    state.followedTopics.delete(result.topic);
  }
  syncStoryFollowState();

  if (state.feedMode !== "latest") {
    await refreshStories();
  } else {
    render();
  }
}

function openAuthorProfile(authorKey) {
  const stories = state.stories.filter((story) => story.authorKey === authorKey);
  if (stories.length === 0) return;

  const author = stories[0];
  const claps = stories.reduce((sum, story) => sum + story.claps, 0);
  const responses = stories.reduce((sum, story) => sum + story.responseCount, 0);
  const topics = [...new Set(stories.map((story) => story.topic))].join(", ");

  state.activeAuthor = authorKey;
  elements.profileAvatar.textContent = getAuthorInitials(author.authorName);
  elements.profileName.textContent = author.authorName;
  elements.profileBio.textContent = author.authorBio;
  const isOwnProfile = authorKey === `user-${state.user?.id}`;
  elements.profileFollowButton.hidden = isOwnProfile;
  elements.profileFollowButton.textContent = isAuthorFollowed(authorKey) ? "Following" : "Follow";
  elements.profileFollowButton.classList.toggle("is-followed", isAuthorFollowed(authorKey));
  elements.profileFollowButton.onclick = () => toggleAuthorFollow(authorKey, author.authorName);
  elements.profileStats.replaceChildren(
    createStat("Stories", stories.length),
    createStat("Claps", claps),
    createStat("Responses", responses),
    createStat("Topics", topics || "None")
  );
  elements.profileStoryList.replaceChildren();

  stories.forEach((story) => {
    elements.profileStoryList.append(
      createStoryLink(story, {
        beforeOpen: () => elements.authorDialog.close()
      })
    );
  });

  elements.authorDialog.showModal();
}

function renderNotifications() {
  elements.notificationList.replaceChildren();

  if (state.notifications.length === 0) {
    elements.notificationList.append(
      createElement("p", { className: "empty-state compact-empty", text: "No notifications yet." })
    );
    return;
  }

  state.notifications.forEach((notification) => {
    const button = createElement("button", {
      className: `notification-item${notification.read ? "" : " is-unread"}`,
      attrs: { type: "button" }
    });
    const message = createElement("strong", { text: notification.message });
    const meta = createElement("span", { text: `${notification.dateLabel} | ${notification.type.replaceAll("_", " ")}` });
    button.append(message, meta);
    button.addEventListener("click", () => openNotification(notification));
    elements.notificationList.append(button);
  });
}

async function openNotificationsDialog() {
  if (!requireUser("view notifications")) return;
  await refreshNotifications();
  renderNotifications();
  elements.notificationsDialog.showModal();
}

async function openNotification(notification) {
  if (!notification.read) {
    const { unreadCount } = await api("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ id: notification.id })
    });
    notification.read = true;
    state.unreadNotificationCount = unreadCount;
    renderSession();
  }

  if (notification.story) {
    elements.notificationsDialog.close();
    await navigateToStory(notification.story.id);
  } else {
    renderNotifications();
  }
}

async function markAllNotificationsRead() {
  const { unreadCount } = await api("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({})
  });
  state.notifications = state.notifications.map((notification) => ({
    ...notification,
    read: true
  }));
  state.unreadNotificationCount = unreadCount;
  renderSession();
  renderNotifications();
}

function createStat(label, value) {
  const row = createElement("div");
  row.append(createElement("dt", { text: label }), createElement("dd", { text: value }));
  return row;
}

function openAuthDialog(mode = "signin") {
  setAuthMode(mode);
  elements.authError.textContent = "";
  elements.authDialog.showModal();
}

function setAuthMode(mode) {
  const isSignup = mode === "signup";

  elements.authModeInput.value = mode;
  elements.authTitle.textContent = isSignup ? "Create your account" : "Welcome back";
  elements.authSubmitButton.textContent = isSignup ? "Create account" : "Sign in";
  elements.authToggleButton.textContent = isSignup ? "Use existing account" : "Create account";
  elements.authNameField.hidden = !isSignup;
  elements.authBioField.hidden = !isSignup;
  elements.authNameInput.required = isSignup;
}

function openSettingsDialog() {
  if (!requireUser("edit settings")) return;

  elements.settingsNameInput.value = state.user.name;
  elements.settingsEmailInput.value = state.user.email;
  elements.settingsBioInput.value = state.user.bio;
  elements.settingsVerificationNote.textContent = state.user.emailVerified
    ? "Email verified."
    : "Email is not verified yet.";
  elements.settingsError.textContent = "";
  showDevLink(elements.settingsDevLink, null);
  elements.settingsDialog.showModal();
}

async function submitSettings(event) {
  event.preventDefault();

  try {
    const { user, devEmail } = await api("/api/me", {
      method: "PUT",
      body: JSON.stringify({
        name: normalizeText(elements.settingsNameInput.value),
        email: normalizeText(elements.settingsEmailInput.value),
        bio: normalizeText(elements.settingsBioInput.value)
      })
    });

    state.user = user;
    showDevLink(elements.settingsDevLink, devEmail);
    elements.settingsVerificationNote.textContent = user.emailVerified
      ? "Email verified."
      : "Email is not verified yet.";
    elements.settingsError.textContent = "";
    await refreshStories();
    await refreshDrafts();
    render();
  } catch (error) {
    elements.settingsError.textContent = error.message;
  }
}

async function requestVerification() {
  if (!requireUser("verify email")) return;

  try {
    const { devEmail, message } = await api("/api/auth/request-verification", {
      method: "POST",
      body: JSON.stringify({})
    });
    elements.settingsError.textContent = message ?? "";
    showDevLink(elements.settingsDevLink, devEmail);
  } catch (error) {
    elements.settingsError.textContent = error.message;
  }
}

async function verifyEmailToken(token) {
  try {
    const { user } = await api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    state.user = user;
    history.replaceState({}, "", "/");
    await refreshStories();
    await refreshDrafts();
    render();
    alert("Email verified.");
  } catch (error) {
    alert(error.message);
  }
}

function openResetDialog(token = "") {
  elements.resetTokenInput.value = token;
  elements.resetEmailInput.value = "";
  elements.resetPasswordInput.value = "";
  elements.resetError.textContent = "";
  showDevLink(elements.resetDevLink, null);
  elements.resetDialog.showModal();
}

async function requestPasswordReset() {
  try {
    const { devEmail, message } = await api("/api/auth/request-reset", {
      method: "POST",
      body: JSON.stringify({ email: normalizeText(elements.resetEmailInput.value) })
    });
    elements.resetError.textContent = message;
    showDevLink(elements.resetDevLink, devEmail);
  } catch (error) {
    elements.resetError.textContent = error.message;
  }
}

async function submitPasswordReset(event) {
  event.preventDefault();

  try {
    await api("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        token: elements.resetTokenInput.value,
        password: elements.resetPasswordInput.value
      })
    });
    elements.resetDialog.close();
    openAuthDialog("signin");
    elements.authError.textContent = "Password changed. Sign in with the new password.";
  } catch (error) {
    elements.resetError.textContent = error.message;
  }
}

function openWriteDialog(story = null) {
  if (!requireUser("write")) return;

  state.editingStoryId = story?.id ?? null;
  state.editingStoryStatus = story?.status ?? "published";
  state.submittingStatus = story?.status ?? "published";
  state.editorImageData = story?.image?.startsWith("data:") ? story.image : "";
  elements.writeTitle.textContent = story?.status === "draft" ? "Edit draft" : story ? "Edit story" : "Publish a story";
  elements.writeSubmitButton.textContent = story?.status === "draft" ? "Publish" : story ? "Save changes" : "Publish";
  elements.saveDraftButton.textContent = story?.status === "draft" ? "Save draft" : "Save as draft";
  elements.titleInput.value = story?.title ?? "";
  elements.excerptInput.value = story?.excerpt ?? "";
  elements.topicInput.value = story?.topic ?? "Design";
  elements.imageUrlInput.value = story?.image?.startsWith("data:") ? "" : story?.image ?? "";
  elements.imageFileInput.value = "";
  elements.richEditor.replaceChildren();
  renderSanitizedHtml(story?.bodyHtml ?? "<p></p>", elements.richEditor);
  setCoverPreview(story?.image ?? "");
  updateEditorCount();
  elements.writeDialog.showModal();
  elements.titleInput.focus();
}

function setCoverPreview(src) {
  elements.coverPreview.hidden = !src;
  elements.coverPreview.src = src || "";
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function uploadImageIfNeeded() {
  if (!state.editorImageData) {
    return normalizeText(elements.imageUrlInput.value) || defaultCoverImage;
  }

  if (!state.editorImageData.startsWith("data:")) {
    return state.editorImageData;
  }

  const { url } = await api("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      fileName: elements.imageFileInput.files[0]?.name ?? "cover-image",
      dataUrl: state.editorImageData
    })
  });

  state.editorImageData = url;
  elements.imageUrlInput.value = url;
  setCoverPreview(url);
  return url;
}

function updateEditorCount() {
  const words = elements.richEditor.textContent.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 220));
  elements.editorCount.textContent = `${words} words | ${minutes} min read`;
}

function runEditorCommand(command) {
  elements.richEditor.focus();

  if (command === "createLink") {
    const url = prompt("Paste a link URL");
    if (!url) return;
    document.execCommand("createLink", false, url);
    updateEditorCount();
    return;
  }

  if (command === "formatBlock:h2") {
    document.execCommand("formatBlock", false, "h2");
  } else if (command === "formatBlock:blockquote") {
    document.execCommand("formatBlock", false, "blockquote");
  } else {
    document.execCommand(command, false, null);
  }

  updateEditorCount();
}

async function submitStory(event) {
  event.preventDefault();

  if (!requireUser("publish")) return;

  const bodyHtml = elements.richEditor.innerHTML.trim();
  const bodyText = getPlainTextFromHtml(bodyHtml);

  if (!bodyText && state.submittingStatus === "published") {
    alert("Write a story before publishing.");
    return;
  }

  const payload = {
    title: normalizeText(elements.titleInput.value),
    excerpt: normalizeText(elements.excerptInput.value),
    topic: normalizeText(elements.topicInput.value),
    image: await uploadImageIfNeeded(),
    bodyHtml,
    minutes: estimateReadingTimeFromHtml(bodyHtml),
    status: state.submittingStatus
  };

  const path = state.editingStoryId
    ? `/api/stories/${encodeURIComponent(state.editingStoryId)}`
    : "/api/stories";
  const method = state.editingStoryId ? "PUT" : "POST";
  const { story } = await api(path, {
    method,
    body: JSON.stringify(payload)
  });

  elements.writeDialog.close();
  upsertStory(story);
  await refreshDrafts();
  await refreshStories();
  render();

  if (story.status === "draft") {
    state.editingStoryId = null;
    return;
  }

  history.pushState({ storyId: story.id }, "", getStoryUrl(story));
  await openStory(story.id);
}

async function deleteActiveStory() {
  if (!state.activeStory?.canEdit) return;

  const confirmed = confirm("Delete this story?");
  if (!confirmed) return;

  await api(`/api/stories/${encodeURIComponent(state.activeStory.id)}`, {
    method: "DELETE"
  });

  state.stories = state.stories.filter((story) => story.id !== state.activeStory.id);
  state.activeStory = null;
  elements.readerDialog.close();
  history.pushState({}, "", "/");
  render();
}

async function addClap() {
  if (!state.activeStory) return;

  const { story } = await api(`/api/stories/${encodeURIComponent(state.activeStory.id)}/clap`, {
    method: "POST",
    body: JSON.stringify({})
  });

  state.activeStory = story;
  upsertStory(story);
  updateReaderActions(story);
  render();
}

async function toggleBookmark() {
  if (!state.activeStory || !requireUser("bookmark stories")) return;

  const { story } = await api(`/api/stories/${encodeURIComponent(state.activeStory.id)}/bookmark`, {
    method: "POST",
    body: JSON.stringify({})
  });

  state.activeStory = story;
  upsertStory(story);
  updateReaderActions(story);
  render();
}

async function submitResponse(event) {
  event.preventDefault();

  if (!state.activeStory || !requireUser("respond")) return;

  const formData = new FormData(elements.responseForm);
  const text = normalizeText(formData.get("text"));
  if (!text) return;

  const { story } = await api(`/api/stories/${encodeURIComponent(state.activeStory.id)}/responses`, {
    method: "POST",
    body: JSON.stringify({ text })
  });

  state.activeStory = story;
  upsertStory(story);
  elements.responseForm.reset();
  renderResponses(story.responses);
  render();
}

async function deleteResponse(responseId) {
  if (!state.activeStory) return;

  const { story } = await api(
    `/api/stories/${encodeURIComponent(state.activeStory.id)}/responses/${encodeURIComponent(responseId)}`,
    {
      method: "DELETE"
    }
  );

  state.activeStory = story;
  upsertStory(story);
  renderResponses(story.responses);
  render();
}

async function moderateResponse(responseId, status) {
  if (!state.activeStory) return;

  const { story } = await api(
    `/api/stories/${encodeURIComponent(state.activeStory.id)}/responses/${encodeURIComponent(responseId)}/moderate`,
    {
      method: "POST",
      body: JSON.stringify({ status })
    }
  );

  state.activeStory = story;
  upsertStory(story);
  renderResponses(story.responses);
  render();
}

function renderAdminModeration() {
  elements.adminResponseList.replaceChildren();
  elements.adminStoryList.replaceChildren();
  elements.adminDiagnosticList.replaceChildren();

  if (state.adminModeration.responses.length === 0) {
    elements.adminResponseList.append(createElement("p", { className: "empty-state compact-empty", text: "No responses yet." }));
  }

  state.adminModeration.responses.forEach((response) => {
    const card = createElement("article", {
      className: `admin-card${response.status === "hidden" ? " is-hidden" : ""}`
    });
    const title = createElement("strong", { text: response.storyTitle });
    const meta = createElement("span", { text: `${response.name} | ${response.dateLabel} | ${response.status}` });
    const text = createElement("p", { text: response.text });
    const actions = createElement("div", { className: "response-actions" });
    const toggle = createElement("button", {
      className: "link-button",
      text: response.status === "hidden" ? "Show" : "Hide",
      attrs: { type: "button" }
    });
    const remove = createElement("button", {
      className: "link-button danger-link",
      text: "Delete",
      attrs: { type: "button" }
    });

    toggle.addEventListener("click", () => adminModerateResponse(response.id, response.status === "hidden" ? "visible" : "hidden"));
    remove.addEventListener("click", () => adminDeleteResponse(response.id));
    actions.append(toggle, remove);
    card.append(title, meta, text, actions);
    elements.adminResponseList.append(card);
  });

  if (state.adminModeration.stories.length === 0) {
    elements.adminStoryList.append(createElement("p", { className: "empty-state compact-empty", text: "No stories yet." }));
  }

  state.adminModeration.stories.forEach((story) => {
    const card = createElement("article", { className: "admin-card" });
    const title = createElement("strong", { text: story.title });
    const meta = createElement("span", {
      text: `${story.authorName} | ${story.status} | ${story.totalResponses} responses`
    });
    const actions = createElement("div", { className: "response-actions" });
    const open = createElement("button", {
      className: "link-button",
      text: "Open",
      attrs: { type: "button" }
    });
    const remove = createElement("button", {
      className: "link-button danger-link",
      text: "Delete",
      attrs: { type: "button" }
    });

    open.addEventListener("click", () => {
      elements.adminDialog.close();
      navigateToStory(story.id);
    });
    remove.addEventListener("click", () => adminDeleteStory(story.id));
    actions.append(open, remove);
    card.append(title, meta, actions);
    elements.adminStoryList.append(card);
  });

  if (state.adminModeration.diagnostics.length === 0) {
    elements.adminDiagnosticList.append(createElement("p", { className: "empty-state compact-empty", text: "No diagnostics yet." }));
  }

  state.adminModeration.diagnostics.forEach((event) => {
    const card = createElement("article", {
      className: `admin-card diagnostic-card${event.severity === "error" ? " is-error" : ""}`
    });
    const title = createElement("strong", { text: event.message });
    const meta = createElement("span", { text: `${event.type} | ${event.severity} | ${event.dateLabel}` });
    const context = createElement("p", { text: diagnosticContextSummary(event.context) });

    card.append(title, meta);
    if (context.textContent) {
      card.append(context);
    }
    elements.adminDiagnosticList.append(card);
  });
}

function diagnosticContextSummary(context) {
  if (!context || typeof context !== "object") return "";

  return Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

async function refreshAdminModeration() {
  const moderation = await api("/api/admin/moderation");
  state.adminModeration = moderation;
  renderAdminModeration();
}

async function openAdminDialog() {
  if (!state.user?.isAdmin) return;

  await refreshAdminModeration();
  elements.adminDialog.showModal();
}

async function adminModerateResponse(responseId, status) {
  await api(`/api/admin/responses/${encodeURIComponent(responseId)}/moderate`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
  await refreshAdminModeration();
  await refreshStories();
}

async function adminDeleteResponse(responseId) {
  await api(`/api/admin/responses/${encodeURIComponent(responseId)}`, {
    method: "DELETE"
  });
  await refreshAdminModeration();
  await refreshStories();
}

async function adminDeleteStory(storyId) {
  const confirmed = confirm("Delete this story as admin?");
  if (!confirmed) return;

  await api(`/api/admin/stories/${encodeURIComponent(storyId)}`, {
    method: "DELETE"
  });
  await refreshAdminModeration();
  await refreshStories();
}

async function submitAuth(event) {
  event.preventDefault();

  const mode = elements.authModeInput.value;
  const payload = {
    email: normalizeText(elements.authEmailInput.value),
    password: elements.authPasswordInput.value
  };

  if (mode === "signup") {
    payload.name = normalizeText(elements.authNameInput.value);
    payload.bio = normalizeText(elements.authBioInput.value);
  }

  try {
    const { user, devEmail } = await api(mode === "signup" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.user = user;
    elements.authDialog.close();
    elements.authForm.reset();
    await refreshFollows();
    await refreshStories();
    await refreshDrafts();
    await refreshNotifications();
    render();
    if (devEmail?.link) {
      alert(`Verification link created for development:\n${devEmail.link}`);
    }
  } catch (error) {
    elements.authError.textContent = error.message;
  }
}

async function signOut() {
  await api("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({})
  });

  state.user = null;
  state.feedMode = "latest";
  state.activeFilter = "all";
  state.followedAuthors = new Map();
  state.followedTopics = new Set();
  state.notifications = [];
  state.unreadNotificationCount = 0;
  await refreshStories();
  await refreshDrafts();
  render();
}

function closeReader() {
  elements.readerDialog.close();

  if (location.pathname.startsWith("/stories/")) {
    history.pushState({}, "", "/");
  }
}

async function handleRoute() {
  const params = new URLSearchParams(location.search);
  const verifyToken = params.get("verify");
  const resetToken = params.get("reset");

  if (verifyToken) {
    await verifyEmailToken(verifyToken);
    return;
  }

  if (resetToken) {
    history.replaceState({}, "", "/");
    openResetDialog(resetToken);
    return;
  }

  const storyMatch = location.pathname.match(/^\/stories\/([^/]+)/);

  if (storyMatch) {
    await navigateToStory(decodeURIComponent(storyMatch[1]), { skipPush: true });
  }
}

function queueBackendSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    state.feedMode = "latest";
    state.activeFilter = "all";
    elements.filterTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.filter === "all");
    });
    refreshStories().catch((error) => {
      elements.emptyState.hidden = false;
      elements.emptyState.textContent = error.message;
    });
  }, 250);
}

elements.startReadingButton.addEventListener("click", () => {
  document.querySelector("#feed").scrollIntoView({ behavior: "smooth" });
});

elements.openWriteButton.addEventListener("click", () => openWriteDialog());

elements.openSavedButton.addEventListener("click", () => {
  if (!requireUser("view saved stories")) return;
  setFilter("bookmarks");
  document.querySelector("#feed").scrollIntoView({ behavior: "smooth" });
});

elements.authButton.addEventListener("click", () => openAuthDialog("signin"));
elements.notificationsButton.addEventListener("click", openNotificationsDialog);
elements.adminButton.addEventListener("click", openAdminDialog);
elements.settingsButton.addEventListener("click", openSettingsDialog);
elements.signOutButton.addEventListener("click", signOut);
elements.loadMoreButton.addEventListener("click", loadMoreStories);

document.querySelector("#closeWriteButton").addEventListener("click", () => {
  elements.writeDialog.close();
});

document.querySelector("#closeReaderButton").addEventListener("click", closeReader);

document.querySelector("#closeAuthorButton").addEventListener("click", () => {
  elements.authorDialog.close();
});

document.querySelector("#closeNotificationsButton").addEventListener("click", () => {
  elements.notificationsDialog.close();
});

document.querySelector("#closeAuthButton").addEventListener("click", () => {
  elements.authDialog.close();
});

document.querySelector("#closeSettingsButton").addEventListener("click", () => {
  elements.settingsDialog.close();
});

document.querySelector("#closeAdminButton").addEventListener("click", () => {
  elements.adminDialog.close();
});

document.querySelector("#closeResetButton").addEventListener("click", () => {
  elements.resetDialog.close();
});

elements.authorButton.addEventListener("click", () => {
  if (!state.activeStory) return;
  elements.readerDialog.close();
  openAuthorProfile(state.activeStory.authorKey);
});

elements.editStoryButton.addEventListener("click", () => {
  if (state.activeStory?.canEdit) {
    elements.readerDialog.close();
    openWriteDialog(state.activeStory);
  }
});

elements.deleteStoryButton.addEventListener("click", deleteActiveStory);

elements.copyLinkButton.addEventListener("click", async () => {
  if (!state.activeStory) return;

  const url = new URL(getStoryUrl(state.activeStory), location.origin).href;
  await navigator.clipboard.writeText(url);
  elements.copyLinkButton.textContent = "Copied";
  setTimeout(() => {
    elements.copyLinkButton.textContent = "Copy link";
  }, 1200);
});

elements.clapButton.addEventListener("click", addClap);
elements.bookmarkButton.addEventListener("click", toggleBookmark);
elements.saveDraftButton.addEventListener("click", () => {
  state.submittingStatus = "draft";
});
elements.writeSubmitButton.addEventListener("click", () => {
  state.submittingStatus = "published";
});
elements.writeForm.addEventListener("submit", submitStory);
elements.writeForm.addEventListener("reset", () => {
  setTimeout(() => {
    state.editorImageData = "";
    state.editingStoryId = null;
    elements.richEditor.replaceChildren();
    setCoverPreview("");
    updateEditorCount();
  }, 0);
});
elements.responseForm.addEventListener("submit", submitResponse);
elements.authForm.addEventListener("submit", submitAuth);
elements.settingsForm.addEventListener("submit", submitSettings);
elements.requestVerificationButton.addEventListener("click", requestVerification);
elements.forgotPasswordButton.addEventListener("click", () => {
  elements.authDialog.close();
  openResetDialog();
});
elements.resetForm.addEventListener("submit", submitPasswordReset);
elements.requestResetButton.addEventListener("click", requestPasswordReset);
elements.markNotificationsReadButton.addEventListener("click", markAllNotificationsRead);
elements.searchInput.addEventListener("input", queueBackendSearch);
elements.richEditor.addEventListener("input", updateEditorCount);

elements.authToggleButton.addEventListener("click", () => {
  setAuthMode(elements.authModeInput.value === "signup" ? "signin" : "signup");
});

elements.imageUrlInput.addEventListener("input", () => {
  if (!state.editorImageData) {
    setCoverPreview(elements.imageUrlInput.value.trim());
  }
});

elements.imageFileInput.addEventListener("change", async () => {
  const file = elements.imageFileInput.files[0];

  if (!file) {
    state.editorImageData = "";
    setCoverPreview(elements.imageUrlInput.value.trim());
    return;
  }

  state.editorImageData = await readFileAsDataUrl(file);
  setCoverPreview(state.editorImageData);
});

elements.editorToolbar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (!button) return;
  runEditorCommand(button.dataset.command);
});

elements.filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => setFilter(tab.dataset.filter));
});

elements.feedTabs.forEach((tab) => {
  tab.addEventListener("click", () => setFeedMode(tab.dataset.feed));
});

document.addEventListener("keydown", (event) => {
  const tagName = document.activeElement?.tagName;
  const isTyping =
    tagName === "INPUT" ||
    tagName === "SELECT" ||
    tagName === "TEXTAREA" ||
    document.activeElement?.isContentEditable;

  if (event.key === "/" && !isTyping) {
    event.preventDefault();
    elements.searchInput.focus();
  }
});

window.addEventListener("popstate", handleRoute);

async function boot() {
  await refreshSession();
  await refreshFollows();
  await refreshStories();
  await refreshDrafts();
  await refreshNotifications();
  render();
  await handleRoute();
}

boot().catch((error) => {
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = error.message;
});
