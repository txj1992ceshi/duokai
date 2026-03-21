import AppButton from '@/components/AppButton';

type Props = {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
};

export default function TablePagination({
  currentPage,
  totalPages,
  onPrev,
  onNext,
}: Props) {
  return (
    <div className="flex items-center justify-between border-t border-neutral-800 px-4 py-3">
      <div className="text-sm text-neutral-400">
        第 {currentPage} / {totalPages} 页
      </div>
      <div className="flex gap-2">
        <AppButton onClick={onPrev} disabled={currentPage === 1} variant="secondary">
          上一页
        </AppButton>
        <AppButton onClick={onNext} disabled={currentPage === totalPages} variant="secondary">
          下一页
        </AppButton>
      </div>
    </div>
  );
}
