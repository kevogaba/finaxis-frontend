import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import {
  type BrowserOrganisation,
  type BrowserPage,
  toBrowserOrganisationPage,
} from '@/auth/context-browser-dto';
import { discoverOrganisations, parseDiscoveryPageQuery } from '@/auth/context-service';
import {
  ContextSelectionPage,
  type ContextSelectionDestination,
} from '@/components/context/context-selection-page';

export const metadata: Metadata = { title: 'Select context' };

const ALLOWED_DESTINATIONS: readonly ContextSelectionDestination[] = [
  '/profile',
  '/admin',
  '/admin/audit',
  '/admin/branches',
  '/admin/roles',
  '/admin/settings',
  '/admin/users',
  '/platform-admin',
  '/platform-admin/tenants',
  '/platform-admin/audit',
];

interface SelectContextPageProps {
  searchParams?: Promise<{
    next?: string | string[];
    page?: string | string[];
    returnTo?: string | string[];
  }>;
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' && error !== null && 'status' in error && error.status === status
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function selectedDestination(
  searchParams: SelectContextPageProps['searchParams'],
): Promise<ContextSelectionDestination> {
  const params = (await searchParams) ?? {};
  const requestedDestination = firstParam(params.next) ?? firstParam(params.returnTo);
  return (
    ALLOWED_DESTINATIONS.find((destination) => destination === requestedDestination) ?? '/profile'
  );
}

async function selectedDiscoveryPage(
  searchParams: SelectContextPageProps['searchParams'],
): Promise<number | null> {
  const params = (await searchParams) ?? {};
  return parseDiscoveryPageQuery(params.page);
}

function emptyOrganisationPage(page: number): BrowserPage<BrowserOrganisation> {
  return {
    items: [],
    page: {
      hasNext: false,
      hasPrevious: page > 0,
      number: page,
      size: 25,
      totalItems: 0,
      totalPages: 0,
    },
  };
}

export default async function SelectContextPage({ searchParams }: SelectContextPageProps) {
  const requestHeaders = await headers();
  const sessionUser = await getAuthenticatedUser(requestHeaders);
  const destination = await selectedDestination(searchParams);

  if (!sessionUser) {
    redirect('/login?reason=session_expired');
  }

  const page = await selectedDiscoveryPage(searchParams);
  if (page === null) {
    return (
      <ContextSelectionPage
        destination={destination}
        hasOrganisationLoadError
        organisations={emptyOrganisationPage(0)}
      />
    );
  }

  let organisationsPage;
  try {
    const organisations = await discoverOrganisations(requestHeaders, page);
    organisationsPage = toBrowserOrganisationPage(organisations);
  } catch (error) {
    if (hasStatus(error, 401)) {
      redirect('/login?reason=session_expired');
    }

    return (
      <ContextSelectionPage
        destination={destination}
        hasOrganisationLoadError
        organisations={emptyOrganisationPage(page)}
      />
    );
  }

  return <ContextSelectionPage destination={destination} organisations={organisationsPage} />;
}
