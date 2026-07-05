// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// CRA's jsdom test environment doesn't define TextEncoder/TextDecoder, which
// react-router@7 references at import time. Polyfill them from Node's util.
import { TextEncoder, TextDecoder } from 'util';

if (typeof global.TextEncoder === 'undefined') {
    (global as any).TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    (global as any).TextDecoder = TextDecoder;
}
