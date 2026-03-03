import test from 'node:test';
import assert from 'node:assert/strict';
import { PubDevClient } from '../pubdevClient';

test('treats build metadata bump as outdated', () => {
    assert.equal(PubDevClient.isOutdated('0.4.1+4', '0.4.1+5'), true);
});

test('classifies build metadata bump as patch update', () => {
    assert.equal(PubDevClient.getUpdateType('0.4.1+4', '0.4.1+5'), 'patch');
});

test('does not report outdated when versions including build metadata match', () => {
    assert.equal(PubDevClient.isOutdated('0.4.1+5', '0.4.1+5'), false);
    assert.equal(PubDevClient.getUpdateType('0.4.1+5', '0.4.1+5'), 'none');
});
