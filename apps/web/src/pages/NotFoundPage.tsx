import { Link } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="This page isn’t here"
        description="The link may be incomplete. Your demonstration workspace is one step away."
      />
      <Link className="button-primary" to="/">
        Back to dashboard
      </Link>
    </>
  );
}
