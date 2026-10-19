import { getGmailMessages } from "./gmail";
import fetch from "node-fetch";

const mockGetTokens = jest.fn();
const mockSetTokens = jest.fn();
const mockRemoveTokens = jest.fn();
const mockAuthorizationRequest = jest.fn();
const mockAuthorize = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock(
  "@raycast/api",
  () => ({
    Icon: { Link: "link" },
    getPreferenceValues: () => ({ gmailClientId: "test-client" }),
    OAuth: {
      RedirectMethod: { AppURI: "app-uri" },
      PKCEClient: jest.fn().mockImplementation(() => ({
        getTokens: (...args: unknown[]) => mockGetTokens(...args),
        setTokens: (...args: unknown[]) => mockSetTokens(...args),
        removeTokens: (...args: unknown[]) => mockRemoveTokens(...args),
        authorizationRequest: (...args: unknown[]) => mockAuthorizationRequest(...args),
        authorize: (...args: unknown[]) => mockAuthorize(...args),
      })),
    },
  }),
  { virtual: true }
);
jest.mock("@googleapis/gmail", () => ({
  auth: { OAuth2: jest.fn().mockImplementation(() => ({ setCredentials: mockSetCredentials })) },
  gmail: jest.fn(() => ({ users: { messages: { list: async () => ({ data: { messages: [] } }) } } })),
}));
jest.mock("node-fetch", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("./utils", () => ({ calculateLookBackMinutes: jest.fn(() => 10) }));

const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
const tokens = (overrides = {}) => ({
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresIn: 3600,
  updatedAt: new Date("2026-10-19T12:00:00Z"),
  isExpired: () => false,
  ...overrides,
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.clearAllMocks();
  mockAuthorizationRequest.mockResolvedValue({ codeVerifier: "verifier", redirectURI: "com.raycast:/oauth" });
  mockAuthorize.mockResolvedValue({ authorizationCode: "authorization-code" });
});

test("converts the Raycast token lifetime into Google's absolute expiration timestamp", async () => {
  mockGetTokens.mockResolvedValue(tokens());
  await getGmailMessages("all", new Date());
  expect(mockSetCredentials).toHaveBeenCalledWith(
    expect.objectContaining({
      expiry_date: new Date("2026-10-19T13:00:00Z").getTime(),
    })
  );
  expect(mockFetch).not.toHaveBeenCalled();
});

test("renews an expired token and keeps the existing refresh token if Google omits it", async () => {
  mockGetTokens.mockResolvedValue(tokens({ isExpired: () => true }));
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ access_token: "new-access", expires_in: 3600 }),
  } as never);
  await getGmailMessages("all", new Date());
  expect(mockSetTokens).toHaveBeenCalledWith(expect.objectContaining({ refresh_token: "refresh-token" }));
  expect(mockRemoveTokens).not.toHaveBeenCalled();
});

test("retains saved authorization after temporary Google errors", async () => {
  mockGetTokens.mockResolvedValue(tokens({ isExpired: () => true }));
  mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "server_error" }) } as never);
  await expect(getGmailMessages("all", new Date())).rejects.toThrow("saved authorization has been kept");
  expect(mockRemoveTokens).not.toHaveBeenCalled();
});

test("retains saved authorization after network failures", async () => {
  mockGetTokens.mockResolvedValue(tokens({ isExpired: () => true }));
  mockFetch.mockRejectedValue(new Error("Network unavailable"));
  await expect(getGmailMessages("all", new Date())).rejects.toThrow("Network unavailable");
  expect(mockRemoveTokens).not.toHaveBeenCalled();
});

test("removes a revoked refresh token and explains how to reconnect", async () => {
  mockGetTokens.mockResolvedValue(tokens({ isExpired: () => true }));
  mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) } as never);
  await expect(getGmailMessages("all", new Date())).rejects.toThrow("Sign in to Gmail again");
  expect(mockRemoveTokens).toHaveBeenCalledTimes(1);
});

test("starts PKCE sign-in for an expired access token without a refresh token", async () => {
  mockGetTokens.mockResolvedValue(tokens({ isExpired: () => true, refreshToken: undefined }));
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ access_token: "new-access" }) } as never);
  await getGmailMessages("all", new Date());
  expect(mockAuthorizationRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      extraParameters: { access_type: "offline", prompt: "consent" },
    })
  );
  const body = new URLSearchParams(mockFetch.mock.calls[0][1]?.body as string);
  expect(body.get("code_verifier")).toBe("verifier");
  expect(body.has("verifier")).toBe(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});
