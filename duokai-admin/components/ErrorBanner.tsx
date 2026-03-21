import NoticeBanner from '@/components/NoticeBanner';

type Props = {
  message: string;
};

export default function ErrorBanner({ message }: Props) {
  return <NoticeBanner message={message} variant="error" />;
}
