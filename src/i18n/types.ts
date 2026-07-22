/** Locale UI chrome for Refined-X (not brand/content identity). */

export type UiCopy = {
	nav: {
		writing: string;
		projects: string;
		about: string;
		primaryAria: string;
		mobileAria: string;
		openMenuAria: string;
		homeAria: (brand: string) => string;
	};
	ask: {
		placeholder: string;
		overlayPlaceholder: string;
		pagePlaceholder: string;
		button: string;
		pageTitle: string;
		pageLede: string;
		openAria: string;
		openTitle: string;
		closeAria: string;
		overlayHeading: string;
		privacyNote: string;
		relatedPublic: string;
		readyStatus: string;
		dataSource: string;
	};
	mcp: {
		guideTitle: string;
		guideLede: string;
		guideFollowup: (unsupported: string) => string;
		agentPrompt: (url: string) => string;
		agentPromptMissing: string;
		openAria: string;
		openTitle: string;
		copyButton: string;
		copied: string;
		copyFailed: string;
		resourcesLabel: string;
		llmsBlurb: string;
		openapiBlurb: string;
		healthLabel: string;
		healthBlurb: string;
		closeAria: string;
	};
	home: {
		sectionAria: string;
		seriesHeading: string;
		allWriting: string;
		latestHeading: string;
	};
	writing: {
		label: string;
		seriesHeading: string;
		archiveHeading: string;
		featuredHeading: string;
		faqHeading: string;
		homeCrumb: string;
	};
	projects: {
		featuredHeading: string;
		coursesHeading: string;
		coursesAria: string;
		courseEmptyAria: string;
		courseCoverAlt: string;
		courseAuthorFallback: string;
		moreHeading: string;
		snippetsHeading: string;
		viewProject: string;
		highlightsAria: string;
		proofAria: (title: string) => string;
	};
	topics: {
		label: string;
		allHeading: string;
		directory: string;
		homeCrumb: string;
		indexDescription: string;
	};
	answers: {
		label: string;
		homeCrumb: string;
		askCta: string;
	};
	about: {
		profileAria: string;
		linksAria: string;
		cooperationFallback: string;
		allProjects: string;
		askCollaborate: (persona: string) => string;
		askCollaborateButton: string;
	};
	common: {
		home: string;
		close: string;
		friends: string;
		relatedReading: string;
		breadcrumbAria: string;
		articleTocAria: string;
		paginationAria: string;
		notFoundDescription: string;
		notFoundTitle: string;
		notFoundLede: string;
		backHome: string;
		browseWriting: string;
	};
	footer: {
		content: string;
		site: string;
		agentFriendly: string;
		topics: string;
		answers: string;
	};
	theme: {
		menuTitle: string;
		preferenceAria: string;
		openMenuAria: string;
		auto: string;
		light: string;
		dark: string;
		triggerAria: (preference: string, current: string) => string;
	};
	askRuntime: {
		thinkingMessages: readonly string[];
		verifyingLive: string;
		curatedSource: string;
		liveSource: string;
		curatedFootPrimary: string;
		liveFootPrimary: string;
		curatedFootSecondary: string;
		liveFootSecondary: string;
		rateLimited: string;
		timeout: string;
		unavailable: string;
		stop: string;
		ask: string;
		showingCurated: string;
		curatedDone: string;
		findingContent: string;
		challengeUnavailable: string;
		challengeScriptFailed: string;
		organizingAnswer: string;
		emptyAnswer: string;
		answerDone: string;
		stoppedText: string;
		stoppedStatus: string;
		temporarilyUnavailable: string;
		loadingVerify: string;
		processingAsk: string;
		turnstileAria: string;
	};
	askSearch: {
		retry: string;
		answersGroup: string;
		articlesGroup: string;
		aiFallback: string;
		loadingIndex: string;
		indexFailed: string;
	};
};
