import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  isPlatformAdmin,
} from "../platform-admin";

const auth = {
  user: {
    id: "user-platform-1",
    email: "admin@voka.local",
    name: "System administrator",
    locale: "en",
    isActive: true,
  },
};

const originalIds =
  process.env
    .VOKA_PLATFORM_ADMIN_USER_IDS;

const originalEmails =
  process.env
    .VOKA_PLATFORM_ADMIN_EMAILS;

afterEach(() => {
  if (originalIds === undefined) {
    delete process.env
      .VOKA_PLATFORM_ADMIN_USER_IDS;
  } else {
    process.env
      .VOKA_PLATFORM_ADMIN_USER_IDS =
        originalIds;
  }

  if (originalEmails === undefined) {
    delete process.env
      .VOKA_PLATFORM_ADMIN_EMAILS;
  } else {
    process.env
      .VOKA_PLATFORM_ADMIN_EMAILS =
        originalEmails;
  }
});

describe(
  "isPlatformAdmin",
  () => {
    it(
      "fails closed when no platform allowlist is configured",
      () => {
        delete process.env
          .VOKA_PLATFORM_ADMIN_USER_IDS;

        delete process.env
          .VOKA_PLATFORM_ADMIN_EMAILS;

        expect(
          isPlatformAdmin(auth),
        ).toBe(false);
      },
    );

    it(
      "accepts an explicitly allowlisted authenticated email",
      () => {
        process.env
          .VOKA_PLATFORM_ADMIN_EMAILS =
          "ADMIN@VOKA.LOCAL";

        expect(
          isPlatformAdmin(auth),
        ).toBe(true);
      },
    );

    it(
      "accepts an explicitly allowlisted authenticated user id",
      () => {
        process.env
          .VOKA_PLATFORM_ADMIN_USER_IDS =
          "user-platform-1";

        expect(
          isPlatformAdmin(auth),
        ).toBe(true);
      },
    );

    it(
      "does not grant platform authority from company role data",
      () => {
        process.env
          .VOKA_PLATFORM_ADMIN_EMAILS =
          "someone-else@example.com";

        expect(
          isPlatformAdmin(auth),
        ).toBe(false);
      },
    );
  },
);
