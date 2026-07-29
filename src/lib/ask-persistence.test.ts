import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAskPersistenceCopy } from './ask-persistence.ts';

const ask = {
	privacyNote: 'used for learning',
	privacyNoteEphemeral: 'not retained by this site',
};
const runtime = {
	liveFootPrimary: 'learning enabled',
	liveFootPrimaryEphemeral: 'question not retained',
};

test('selects persistent and non-persistent privacy copy from the site setting', () => {
	assert.deepEqual(selectAskPersistenceCopy(true, ask, runtime), {
		privacyNote: 'used for learning',
		liveFootPrimary: 'learning enabled',
	});
	assert.deepEqual(selectAskPersistenceCopy(false, ask, runtime), {
		privacyNote: 'not retained by this site',
		liveFootPrimary: 'question not retained',
	});
});
