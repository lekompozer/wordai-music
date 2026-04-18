export interface YTShortItem {
    id: string;
    youtube_id: string;
    title: string;
    channel_name: string;
    channel?: string;
    view_count: string | number;
    youtube_url: string;
    duration: string;
    thumb_url: string;
    source_tag?: string;
}
