/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// Fake timers keep the looping scanner animations from running past the test.
jest.useFakeTimers();

test('renders the app (signed out, no profile) without crashing', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  expect(renderer!.toJSON()).toBeTruthy();
  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
