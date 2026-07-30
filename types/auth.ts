export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  isActive: boolean;
};

export type AuthCompany = {
  id: string;
  name: string | null;
  slug: string;
  isActive: boolean;
};

export type AuthMembership = {
  membershipId: string;
  company: AuthCompany;
  role: string;
  status: string;
};

export type AuthContext = {
  user: AuthUser;
  memberships: AuthMembership[];
  activeCompanyId: string | null;
};

