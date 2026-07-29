type AskPersistenceCopy = {
	privacyNote: string;
	privacyNoteEphemeral: string;
};

type AskRuntimePersistenceCopy = {
	liveFootPrimary: string;
	liveFootPrimaryEphemeral: string;
};

export function selectAskPersistenceCopy(
	persistInteractions: boolean,
	ask: AskPersistenceCopy,
	runtime: AskRuntimePersistenceCopy,
) {
	return {
		privacyNote: persistInteractions ? ask.privacyNote : ask.privacyNoteEphemeral,
		liveFootPrimary: persistInteractions
			? runtime.liveFootPrimary
			: runtime.liveFootPrimaryEphemeral,
	};
}
