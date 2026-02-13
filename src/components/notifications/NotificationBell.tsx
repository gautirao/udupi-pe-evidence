import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  type NotificationResponse,
} from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function parseListingId(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return parsed.listing_id ?? parsed.listingId ?? null;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: notifications = [], isLoading, isError, refetch } = useNotifications();
  const { data: unreadData } = useUnreadCount();
  const markAsRead = useMarkAsRead();

  const unreadCount = unreadData?.count ?? 0;
  const displayNotifications = notifications.slice(0, 20);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      refetch();
    }
  }

  function handleClick(notification: NotificationResponse) {
    if (!notification.isRead) {
      markAsRead.mutate(notification.id);
    }
    const listingId = parseListingId(notification.metadata);
    if (listingId) {
      navigate(`/listings/${listingId}`);
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3">
          <h4 className="text-sm font-semibold">Notifications</h4>
        </div>
        <Separator />
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            Unable to load notifications
          </div>
        ) : displayNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            {displayNotifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={cn(
                  'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  !notification.isRead && 'bg-primary/5',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'text-sm leading-tight',
                      notification.isRead ? 'text-muted-foreground' : 'font-medium',
                    )}
                  >
                    {notification.title}
                  </span>
                  {!notification.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <span className="line-clamp-2 text-xs text-muted-foreground">
                  {notification.message}
                </span>
                <span className="text-xs text-muted-foreground/60">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </span>
              </button>
            ))}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
