import NoticeBanner from '@/components/NoticeBanner';

type Props = {
  message: string;
};

export default function SuccessBanner({ message }: Props) {
  return <NoticeBanner message={message} variant="success" />;
}
