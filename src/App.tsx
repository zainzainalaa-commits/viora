import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { FloatingBack } from "@/chrome/floating-back";
import { MinUIDock } from "@/chrome/minui-dock";
import { Sidebar } from "@/chrome/sidebar";
import { DraculaSidebar } from "@/chrome/dracula-sidebar";
import { NordSidebar } from "@/chrome/nord-sidebar";
import { ForestSidebar } from "@/chrome/forest-sidebar";
import { RoyalTopbar } from "@/chrome/royal-topbar";
import { SideRail } from "@/chrome/siderail";
import { StremioRail } from "@/chrome/stremio-rail";
import { TopDock } from "@/chrome/topdock";
import { CinematicOverlay } from "@/chrome/cinematic-overlay";
import { Topbar } from "@/chrome/topbar";
import { startMaintenance, subscribeMemoryPressure } from "@/lib/maintenance";
import { MiddleClickScroll } from "@/lib/use-middle-click-scroll";
import { flushCloudSync } from "@/views/player/hooks/use-stremio-sync";
import { useOverlayPinned } from "@/lib/overlay-pin";
import { isDpadPrimary, isMobileDevice, isWeb } from "@/lib/platform";
import { useIsPhone } from "@/lib/use-form-factor";
import { MobileTabBar } from "@/chrome/mobile-tabbar";
import { installLongPressContextMenu } from "@/lib/long-press-context-menu";
import { activeLayout } from "@/lib/theme";
import { useThemePreview } from "@/lib/theme-preview";
import { DevErrorTrigger } from "@/components/dev-error-trigger";
import { ErrorView } from "@/components/error-view";
import { HarborErrorBoundary } from "@/components/error-boundary";
import { ContextMenu } from "@/components/context-menu";
import { WatchLocalModal } from "@/components/player/watch-local-modal";
import { LocalEpisodesModal } from "@/components/player/local-episodes-modal";
import { CurfewGuard } from "@/components/curfew-guard";
import { HoverPreview } from "@/components/hover-preview";
import { CustomHoverCssMount } from "@/components/custom-hover-css-mount";
import { EmbedViewportRoot } from "@/components/embed-viewport";
import { CustomCodeMount } from "@/components/custom-code-mount";
import { OfflineBanner } from "@/chrome/offline-banner";
import { MobileNotice } from "@/components/mobile-notice";
import { WebhookLoopMount } from "@/components/webhook-loop-mount";
import { ListToastHost } from "@/components/lists/list-toast";
import { TogetherChatToast } from "@/components/together-chat-toast";
import { TogetherCursors } from "@/components/together-cursors";
import { TogetherHostLeavingPrompt } from "@/components/together-host-leaving-prompt";
import { TogetherInviteToast } from "@/components/together-invite-toast";
import { TogetherSummonToast } from "@/components/together-summon-toast";
import { TogetherParticipantLeftToast } from "@/components/together-participant-left-toast";
import { AnilistSyncToast } from "@/components/anilist/anilist-sync-toast";
import { AnilistAvatarSync } from "@/components/anilist/anilist-avatar-sync";
import { MalAvatarSync } from "@/components/mal/mal-avatar-sync";
import { MalSyncToast } from "@/components/mal/mal-sync-toast";
import { TogetherLeaveForLiveModal } from "@/components/together-leave-for-live-modal";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { TopRankModal } from "@/components/top-rank-modal";
import { AuthProvider } from "@/lib/auth";
import { ProfilesProvider, useProfiles } from "@/lib/profiles";
import { ProfileIdentitySync } from "@/lib/profile-identity-sync";
import { SettingsProfileBridge } from "@/lib/settings-profile-bridge";
import { TrackerProfileBridge } from "@/lib/tracker-profile-bridge";
import { ProfilePickerModal } from "@/components/profile-picker/picker-modal";
import { WatchlistSync } from "@/lib/watchlist-sync";
import { ContextMenuProvider } from "@/lib/context-menu";
import { TopRankModalProvider } from "@/lib/top-rank-modal";
import { OnboardingProvider } from "@/lib/onboarding";
import { RankingsProvider } from "@/lib/rankings";
import { SettingsProvider } from "@/lib/settings";
import { SearchProvider, useSearch } from "@/lib/search-context";
import { SearchOverlay } from "@/components/search/search-overlay";
import { SearchHotkey } from "@/components/search/search-hotkey";
import { TogetherProvider, useTogether } from "@/lib/together/provider";
import { DvrProvider } from "@/lib/dvr/provider";
import { FavoritesProvider } from "@/lib/iptv/favorites";
import { MediaFavoritesProvider } from "@/lib/media-favorites";
import { LocalWatchlistProvider } from "@/lib/local-watchlist";
import { useSettings } from "@/lib/settings";
import { readActiveStremioAuthKey } from "@/lib/auth";
import { effectiveBinding, eventToBinding } from "@/lib/hotkeys";
import { ViewProvider, useView, type Frame, type MetaFilter, type View } from "@/lib/view";
import type { MetaType } from "@/lib/cinemeta";
import { Home, HOME_HERO } from "@/views/home";
import { MOVIES_HERO } from "@/components/cinema-hero";
import { SHOWS_HERO } from "@/components/peek-hero";
import { SETTINGS_NAV } from "@/views/settings/nav";
import { ParentalProvider } from "@/lib/parental";
import { TraktProvider } from "@/lib/trakt/provider";
import { AnilistProvider } from "@/lib/anilist/provider";
import { MalProvider } from "@/lib/mal/provider";
import { SimklProvider } from "@/lib/simkl/provider";
import { LetterboxdProvider } from "@/lib/stremboxd/provider";
import { FocusLayer, FocusSection, focusKeys, setFocusSafely, useBackHandler } from "@/lib/tv-focus";

const importAnime = () => import("@/views/anime");
const importCalendar = () => import("@/views/calendar");
const importDetail = () => import("@/views/detail");
const importAddons = () => import("@/views/addons");
const importDiscover = () => import("@/views/discover");
const importAward = () => import("@/views/award");
const importAnimeAward = () => import("@/views/anime-award");
const importFilter = () => import("@/views/filter");
const importGrid = () => import("@/views/grid");
const importPerson = () => import("@/views/person");
const importCollection = () => import("@/views/collection");
const importEpisodeDetail = () => import("@/views/episode-detail");
const importPlayPicker = () => import("@/views/play-picker");
const importPlayer = () => import("@/views/player");
const importMovies = () => import("@/views/movies");
const importKids = () => import("@/views/kids");
const importQueue = () => import("@/views/queue");
const importService = () => import("@/views/service");
const importSettings = () => import("@/views/settings");
const importShows = () => import("@/views/shows");
const importLibrary = () => import("@/views/library");
const importLive = () => import("@/views/live");
const importVod = () => import("@/views/playlist-vod");
const importDownloads = () => import("@/views/downloads");
const importMatchDetail = () => import("@/views/live/match-detail-view");
const importOnboarding = () => import("@/components/onboarding");

const AnimeView = lazy(() => importAnime().then((m) => ({ default: m.AnimeView })));
const CalendarView = lazy(() => importCalendar().then((m) => ({ default: m.CalendarView })));
const DetailView = lazy(() => importDetail().then((m) => ({ default: m.DetailView })));
const AddonsView = lazy(() => importAddons().then((m) => ({ default: m.AddonsView })));
const Discover = lazy(() => importDiscover().then((m) => ({ default: m.Discover })));
const AwardView = lazy(() => importAward().then((m) => ({ default: m.AwardView })));
const AnimeAwardView = lazy(() => importAnimeAward().then((m) => ({ default: m.AnimeAwardView })));
const FilterView = lazy(() => importFilter().then((m) => ({ default: m.FilterView })));
const GridView = lazy(() => importGrid().then((m) => ({ default: m.GridView })));
const PersonView = lazy(() => importPerson().then((m) => ({ default: m.PersonView })));
const CollectionView = lazy(() => importCollection().then((m) => ({ default: m.CollectionView })));
const EpisodeDetailView = lazy(() => importEpisodeDetail().then((m) => ({ default: m.EpisodeDetailView })));
const CollectionsView = lazy(() => import("@/views/collections").then((m) => ({ default: m.CollectionsView })));
const PlayPicker = lazy(() => importPlayPicker().then((m) => ({ default: m.PlayPicker })));
const PlayerView = lazy(() => importPlayer().then((m) => ({ default: m.PlayerView })));
const Movies = lazy(() => importMovies().then((m) => ({ default: m.Movies })));
const Kids = lazy(() => importKids().then((m) => ({ default: m.Kids })));
const KidsDetailView = lazy(() =>
  import("@/views/kids-detail").then((m) => ({ default: m.KidsDetailView })),
);
const QueueView = lazy(() => importQueue().then((m) => ({ default: m.QueueView })));
const ServiceView = lazy(() => importService().then((m) => ({ default: m.ServiceView })));
const Settings = lazy(() => importSettings().then((m) => ({ default: m.Settings })));
const Shows = lazy(() => importShows().then((m) => ({ default: m.Shows })));
const LibraryView = lazy(() => importLibrary().then((m) => ({ default: m.LibraryView })));
const LiveView = lazy(() => importLive().then((m) => ({ default: m.LiveView })));
const MatchDetailView = lazy(() => importMatchDetail().then((m) => ({ default: m.MatchDetailView })));
const PlaylistVodView = lazy(() => importVod().then((m) => ({ default: m.PlaylistVodView })));
const DownloadsView = lazy(() => importDownloads().then((m) => ({ default: m.DownloadsView })));
const OnboardingModal = lazy(() => importOnboarding().then((m) => ({ default: m.OnboardingModal })));

function useViewPreloader() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    };
    const schedule = (cb: () => void) =>
      typeof win.requestIdleCallback === "function"
        ? win.requestIdleCallback(cb, { timeout: 2500 })
        : window.setTimeout(cb, 1200);
    schedule(() => {
      if (cancelled) return;
      void importDetail();
      void importPlayPicker();
      void importPlayer();
      void importSettings();
      void importAddons();
      void importDiscover();
      void importPerson();
      void importFilter();
      void importCalendar();
      void importMovies();
      void importShows();
      void importLive();
      void importAnime();
      void importQueue();
      void importAward();
      void importAnimeAward();
      void importService();
      void importMatchDetail();
      void importOnboarding();
    });
    return () => {
      cancelled = true;
    };
  }, []);
}

const KEEP_ALIVE_MS = 1500;
const IDLE_EVICT_MS = 60 * 1000;
const PRESSURE_EVICT_MS = 1500;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.6;
const UI_SCALE_STEP = 0.05;
const UI_SCALE_ACTIVITY_EVENT = "harbor:ui-scale-activity";

function clampUiScale(scale: number): number {
  return Math.max(UI_SCALE_MIN, Math.min(UI_SCALE_MAX, Math.round(scale * 100) / 100));
}

function useKeepAlive(active: boolean, requested: boolean, pin = false): boolean {
  const [mounted, setMounted] = useState(active && requested);
  if (requested && (active || pin) && !mounted) setMounted(true);
  useEffect(() => {
    if (!requested) {
      setMounted(false);
      return;
    }
    if (active || pin) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), KEEP_ALIVE_MS);
    return () => clearTimeout(t);
  }, [active, requested, pin]);
  return mounted;
}

function useIdleEvict(active: boolean, pin = false): boolean {
  const [alive, setAlive] = useState(active);
  const [pressure, setPressure] = useState(false);
  if ((active || pin) && !alive) setAlive(true);
  useEffect(() => subscribeMemoryPressure(setPressure), []);
  useEffect(() => {
    if (active || pin) {
      setAlive(true);
      return;
    }
    if (!alive) return;
    const t = setTimeout(() => setAlive(false), pressure ? PRESSURE_EVICT_MS : IDLE_EVICT_MS);
    return () => clearTimeout(t);
  }, [active, alive, pressure, pin]);
  return alive;
}

export function App() {
  if (isWeb() && isMobileDevice()) return <MobileNotice />;
  return (
    <SettingsProvider>
      <ProfilesProvider>
      <ParentalProvider>
      <TraktProvider>
      <AnilistProvider>
      <MalProvider>
      <SimklProvider>
      <LetterboxdProvider>
      <RankingsProvider>
        <AuthProvider>
          <OnboardingProvider>
            <TogetherProvider>
              <ViewProvider>
                <SearchProvider>
                <DvrProvider>
                <FavoritesProvider>
                <MediaFavoritesProvider>
                <LocalWatchlistProvider>
                <ContextMenuProvider>
                  <TopRankModalProvider>
                    <HarborErrorBoundary>
                      <ProfileIdentitySync />
                      <SettingsProfileBridge />
                      <TrackerProfileBridge />
                      <AnilistAvatarSync />
                      <MalAvatarSync />
                      <MiddleClickScroll />
                      <ThemeBackdrop />
                      <WatchlistSync />
                      <Shell />
                      <Suspense fallback={null}>
                        <OnboardingModal />
                      </Suspense>
                      <TogetherInviteToast />
                      <TogetherFloater />
                      <TogetherHostLeavingPrompt />
                      <TogetherSummonToast />
                      <TogetherParticipantLeftToast />
                      <AnilistSyncToast />
                      <MalSyncToast />
                      <ListToastHost />
                      <TogetherLeaveForLiveModal />
                      <TogetherLocationPublisher />
                      <DiscordPresence />
                      <ContextMenu />
                      <WatchLocalModal />
                      <LocalEpisodesModal />
                      <HoverPreview />
                      <CustomHoverCssMount />
                      <TopRankModal />
                      <ProfilePickerModal />
                      <CurfewGuard />
                      <SearchOverlay />
                      <SearchHotkey />
                      <EmbedViewportRoot />
                    </HarborErrorBoundary>
                    <ErrorView />
                    <DevErrorTrigger />
                  </TopRankModalProvider>
                </ContextMenuProvider>
                </LocalWatchlistProvider>
                </MediaFavoritesProvider>
                </FavoritesProvider>
                </DvrProvider>
                </SearchProvider>
              </ViewProvider>
            </TogetherProvider>
          </OnboardingProvider>
        </AuthProvider>
      </RankingsProvider>
      </LetterboxdProvider>
      </SimklProvider>
      </MalProvider>
      </AnilistProvider>
      </TraktProvider>
      </ParentalProvider>
      </ProfilesProvider>
    </SettingsProvider>
  );
}

function TogetherFloater() {
  const { chromeHidden } = useView();
  if (chromeHidden) return null;
  return (
    <>
      <TogetherChatToast />
      <TogetherCursors />
    </>
  );
}

function TogetherLocationPublisher() {
  const { topKind, meta, personId, picker, player, service, addonDetailId } = useView();
  const { snapshot, sendPresence } = useTogether();
  const inSession = snapshot.state === "joined";
  const participantsCount = snapshot.participants.length;
  useEffect(() => {
    if (!inSession) return;
    const location = computeLocation();
    sendPresence(location ?? undefined);
    const id = window.setInterval(() => sendPresence(location ?? undefined), 6000);
    return () => window.clearInterval(id);
    function computeLocation(): import("@/lib/together/protocol").ParticipantLocation | null {
      const metaToLoc = (m: import("@/lib/cinemeta").Meta) => ({
        id: m.id,
        type: (m.type === "series" ? "series" : "movie") as "movie" | "series",
        name: m.name,
        poster: m.poster,
        background: m.background,
        releaseInfo: m.releaseInfo,
        logo: m.logo,
      });
      if (player) {
        return {
          kind: "player" as const,
          meta: metaToLoc(player.meta),
          episode: player.episode
            ? { season: player.episode.season, episode: player.episode.episode, name: player.episode.name }
            : undefined,
        };
      }
      if (picker) {
        return {
          kind: "picker" as const,
          meta: metaToLoc(picker.meta),
          episode: picker.episode
            ? { season: picker.episode.season, episode: picker.episode.episode, name: picker.episode.name }
            : undefined,
        };
      }
      if (topKind === "meta" && meta) return { kind: "meta" as const, meta: metaToLoc(meta) };
      if (topKind === "person" && personId != null) return { kind: "person" as const, personId };
      if (topKind === "service" && service) return { kind: "service" as const, service };
      if (topKind === "addon-detail" && addonDetailId)
        return { kind: "addon-detail" as const, addonId: addonDetailId };
      if (topKind === "home") return { kind: "home" };
      if (topKind === "discover") return { kind: "discover" };
      if (topKind === "anime") return { kind: "anime" };
      if (topKind === "queue") return { kind: "queue" };
      if (topKind === "addons") return { kind: "addons" };
      if (topKind === "library") return { kind: "home" };
      if (topKind === "settings") return { kind: "settings" };
      return null;
    }
  }, [
    inSession,
    sendPresence,
    topKind,
    meta?.id,
    personId,
    picker?.meta.id,
    picker?.episode?.season,
    picker?.episode?.episode,
    player?.meta.id,
    player?.episode?.season,
    player?.episode?.episode,
    service,
    addonDetailId,
    participantsCount,
  ]);
  return null;
}

function DiscordPresence() {
  return null;
}

function filterReactKey(f: MetaFilter): string {
  if (f.kind === "year" || f.kind === "runtime") return `filter-${f.kind}-${f.mediaType}-${f.value}`;
  if (f.kind === "country" || f.kind === "language") return `filter-${f.kind}-${f.mediaType}-${f.iso}`;
  return `filter-${f.kind}-${f.mediaType}-${f.id}`;
}

function parseDeepLinkEpisode(videoId?: string): { season: number; episode: number } | undefined {
  if (!videoId) return undefined;
  const parts = videoId.split(":");
  if (parts.length < 3) return undefined;
  const season = Number(parts[parts.length - 2]);
  const episode = Number(parts[parts.length - 1]);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return undefined;
  return { season, episode };
}

function Shell() {
  const { topKind, service, meta, metaLiveContext, metaEpisodeHint, episodeDetail, personId, collectionId, filter, grid, awardType, animeAwardSource, picker, player, setView, canGoBack, goBack, canGoForward, goForward, openMeta, openPlayer, stackKinds, chromeHidden } = useView();
  const { settings, update } = useSettings();
  const { setOpen: setSearchOpen } = useSearch();
  const uiScaleRef = useRef(settings.uiScale);
  const { activeProfile } = useProfiles();
  const kid = activeProfile?.kid ?? null;
  const preview = useThemePreview();
  const baseLayout = useMemo(
    () => (preview ? preview.layout : activeLayout(settings.theme)),
    [preview, settings.theme],
  );
  // Every desktop layout puts navigation at the top or in a side rail, both out
  // of thumb reach at phone width. Phones get a bottom tab bar instead, which
  // means none of the ten themed chromes render there.
  const phoneLayout = useIsPhone();
  const layout = phoneLayout ? "mobile" : kid ? "sidebar" : baseLayout;
  const themeHasTopbar =
    layout === "sidebar" ||
    layout === "dracula" ||
    layout === "nord" ||
    layout === "forest" ||
    layout === "stremio";
  useViewPreloader();

  useEffect(() => installLongPressContextMenu(), []);

  // Outermost Back handler: pop the view stack while there is one, otherwise
  // fall back to the sidebar so Back never leaves the user with nowhere to go.
  useBackHandler(() => {
    if (player) return false;
    // Live is entered by switching view, not by pushing onto the stack, so
    // there is nothing for goBack to pop — and Live hides the sidebar, which
    // used to leave its on-screen Back button as the only way out. Sending the
    // remote's Back to Home is what keeps it from being a dead end.
    if (topKind === "live") {
      setView("home");
      return true;
    }
    // A pushed screen — a title, a person, a collection — keeps Back as "leave
    // this page", and the screen underneath restores the card it was opened
    // from. That is the middle of the stack: Details → Screen.
    if (stackKinds.length > 1) {
      goBack();
      return true;
    }

    // The end of the stack: Screen → rail. Arrows cannot reach the rail any
    // more — every screen is a closed region — so this press is the only way
    // back to it, and it lands on the entry the viewer left from because the
    // rail remembers its own last child.
    const inSidebar = !!document.activeElement?.closest("aside");
    if (!inSidebar && document.querySelector("aside") && setFocusSafely(focusKeys.sidebar)) {
      return true;
    }

    if (topKind !== "home") {
      goBack();
      return true;
    }
    // At the root with focus already on the rail there is nowhere further to go,
    // so the press is declined and Android closes the app — the behaviour a TV
    // viewer expects from Back on a home screen.
    return false;
  }, !player);
  
  useEffect(() => startMaintenance(), []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 3) {
        const localBack = new Event("harbor:local-back", { cancelable: true });
        if (!window.dispatchEvent(localBack)) {
          e.preventDefault();
          return;
        }
        if (canGoBack) {
          e.preventDefault();
          goBack();
        }
      } else if (e.button === 4 && canGoForward) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [canGoBack, goBack, canGoForward, goForward]);

  useEffect(() => {
    uiScaleRef.current = settings.uiScale;
  }, [settings.uiScale]);

  useEffect(() => {
    const setUiScale = (next: number) => {
      const uiScale = clampUiScale(next);
      if (uiScale !== uiScaleRef.current) {
        uiScaleRef.current = uiScale;
        update({ uiScale });
      }
    };
    const stepUiScale = (direction: 1 | -1) => {
      setUiScale(uiScaleRef.current + direction * UI_SCALE_STEP);
    };
    const usesZoomModifier = (e: KeyboardEvent | WheelEvent) => e.ctrlKey || e.metaKey;
    const isDefaultUiScaleUp = (e: KeyboardEvent) =>
      usesZoomModifier(e) && (e.key === "+" || e.key === "=");
    const isDefaultUiScaleDown = (e: KeyboardEvent) =>
      usesZoomModifier(e) && (e.key === "-" || e.key === "_");
    const isDefaultUiScaleReset = (e: KeyboardEvent) =>
      usesZoomModifier(e) && e.key === "0";
    const onKey = (e: KeyboardEvent) => {
      const binding = eventToBinding(e);
      const overrides = settings.hotkeys ?? {};
      const uiScaleUpCustom = "globalUiScaleUp" in overrides;
      const uiScaleDownCustom = "globalUiScaleDown" in overrides;
      const uiScaleResetCustom = "globalUiScaleReset" in overrides;
      const matchesUp =
        effectiveBinding("globalUiScaleUp", overrides) === binding || (!uiScaleUpCustom && isDefaultUiScaleUp(e));
      const matchesDown =
        effectiveBinding("globalUiScaleDown", overrides) === binding || (!uiScaleDownCustom && isDefaultUiScaleDown(e));
      const matchesReset =
        effectiveBinding("globalUiScaleReset", overrides) === binding || (!uiScaleResetCustom && isDefaultUiScaleReset(e));
      if (!matchesUp && !matchesDown && !matchesReset) return;
      if (player && matchesReset) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      window.dispatchEvent(new Event(UI_SCALE_ACTIVITY_EVENT));
      if (matchesReset) {
        setUiScale(1);
      } else if (matchesUp) {
        stepUiScale(1);
      } else if (matchesDown) {
        stepUiScale(-1);
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!usesZoomModifier(e)) return;
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new Event(UI_SCALE_ACTIVITY_EVENT));
      stepUiScale(e.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [player, settings.hotkeys, update]);

  useEffect(() => {
    const onKey = (_e: KeyboardEvent) => {};
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("harbor://app-closing", async () => {
        await flushCloudSync().catch(() => {});
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("harbor_flush_done").catch(() => {});
      }).then((u) => {
        if (cancelled) u();
        else unlisten = u;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const w = window as unknown as { harbor?: Record<string, unknown> };
    w.harbor = {
      ...(w.harbor ?? {}),
      navigate: (v: string) => setView(v as View),
      back: () => goBack(),
      search: () => setSearchOpen(true),
    };
  }, [setView, goBack, setSearchOpen]);

  useEffect(() => {
    void import("@/lib/addon-store").then(({ ensureBuiltInAddons }) => ensureBuiltInAddons());
  }, []);

  // A TMDB key already given to the addon does not need giving again here.
  useEffect(() => {
    void import("@/lib/providers/tmdb/adopt-addon-key").then(({ adoptTmdbFromAddon }) =>
      adoptTmdbFromAddon(
        readActiveStremioAuthKey(),
        { tmdbKey: settings.tmdbKey, tmdbLanguage: settings.tmdbLanguage },
        update,
      ),
    );
  }, [settings.tmdbKey, settings.tmdbLanguage, update]);

  useEffect(() => {
    let dispose: (() => void) | null = null;
    void import("@/lib/deep-link").then(({ startDeepLinkBridge, onDeepLinkInstall, onDeepLinkOpen, onOpenLocalFile }) => {
      void startDeepLinkBridge().then((stopBridge) => {
        const stopListener = onDeepLinkInstall(() => {
          if (window.__harborInstallerOpen) return;
          setView("addons");
        });
        const stopOpen = onDeepLinkOpen(({ type, id, videoId }) => {
          const hint = parseDeepLinkEpisode(videoId);
          openMeta({ id, type: type as MetaType, name: "" }, hint ? { episodeHint: hint } : undefined);
        });
        const stopFile = onOpenLocalFile((path) => {
          const name = (path.replace(/\\/g, "/").split("/").pop() || "Video").replace(/\.[^.]+$/, "");
          openPlayer({ meta: { id: `local:${path}`, type: "movie", name }, url: path, title: name, notWebReady: true });
        });
        dispose = () => {
          stopBridge();
          stopListener();
          stopOpen();
          stopFile();
        };
      });
    });
    return () => {
      dispose?.();
    };
  }, [setView, openMeta, openPlayer]);

  useEffect(() => {
    if (topKind === "anime" && settings.hideContent.anime) setView("home");
  }, [topKind, settings.hideContent.anime, setView]);

  useEffect(() => {
    if (!kid || player) return;
    const allowed =
      topKind === "kids" ||
      topKind === "meta" ||
      topKind === "picker" ||
      topKind === "grid" ||
      topKind === "collection";
    if (!allowed) setView("kids");
  }, [kid, player, topKind, setView]);

  useEffect(() => {
    if (!activeProfile) return;
    if (!activeProfile.kid && topKind === "kids") setView("home");
  }, [activeProfile?.id]);

  const playerActive = !!player;
  const pickerTop = topKind === "picker";
  const personTop = topKind === "person";
  const collectionTop = topKind === "collection";
  const episodeDetailTop = topKind === "episode-detail";
  const collectionsIndexTop = topKind === "collections";
  const collectionsIndexAlive = useKeepAlive(
    collectionsIndexTop,
    true,
    stackKinds.includes("collections"),
  );
  const detailTop = topKind === "meta";
  const filterTop = topKind === "filter";
  const gridTop = topKind === "grid";
  const awardTop = topKind === "award";
  const animeAwardTop = topKind === "anime-award";
  const settingsTop = topKind === "settings";
  const animeTop = topKind === "anime";
  const discoverTop = topKind === "discover";
  const addonsTop = topKind === "addons" || topKind === "addon-detail";
  const calendarTop = topKind === "calendar";
  const queueTop = topKind === "queue";
  const serviceTop = topKind === "service";
  const homeTop = topKind === "home";
  const moviesTop = topKind === "movies";
  const kidsTop = topKind === "kids";
  const showsTop = topKind === "shows";
  const libraryTop = topKind === "library";
  const liveTop = topKind === "live";
  // Live TV gives up the sidebar for the width its channel grid wants — a fair
  // trade with a mouse, which can always reach the corner again. A remote
  // cannot: with no playlist connected the screen holds one button, and every
  // direction on the D-pad does nothing at all. The rail stays on television.
  //
  // Only the rail: `liveTop` itself also keeps the view from being evicted and
  // marks which focus layer is on top, and neither of those has anything to do
  // with how wide the channel grid would like to be.
  const liveHidesRail = liveTop && !isDpadPrimary();
  const vodTop = topKind === "vod";
  const downloadsTop = topKind === "downloads";
  const matchDetailTop = topKind === "match-detail";

  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    const onImm = (e: Event) => setImmersive((e as CustomEvent<boolean>).detail === true);
    window.addEventListener("harbor:immersive", onImm);
    return () => window.removeEventListener("harbor:immersive", onImm);
  }, []);
  useEffect(() => {
    if (!liveTop && immersive) setImmersive(false);
  }, [liveTop, immersive]);

  useEffect(() => {
    const root = document.documentElement;
    if (playerActive || pickerTop || immersive || settingsTop || chromeHidden) root.dataset.chromeHidden = "true";
    else delete root.dataset.chromeHidden;
  }, [playerActive, pickerTop, immersive, settingsTop, chromeHidden]);

  useEffect(() => {
    document.querySelectorAll("[data-harbor-nav]").forEach((el) => {
      el.toggleAttribute("data-active", el.getAttribute("data-harbor-nav") === topKind);
    });
  }, [topKind]);

  // The active screen needs a box of its own, not `display: contents`.
  //
  // `contents` removes the element from layout entirely, so it measures 0x0 at
  // the origin. The engine navigates by comparing geometry, and a screen that
  // reports itself as a point in the top-left corner is never "below" the
  // topbar or "right of" the sidebar — so focus that stepped out of the content
  // could never step back into it, and the remote froze. Its children already
  // filled the parent this way, so the rendered layout is unchanged.
  const layer = (top: boolean) => (top ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden");

  const overlayPinned = useOverlayPinned();
  const settingsAlive = useIdleEvict(settingsTop, overlayPinned);
  const animeAlive = useIdleEvict(animeTop);
  const discoverAlive = useIdleEvict(discoverTop);
  const addonsAlive = useIdleEvict(addonsTop);
  const calendarAlive = useIdleEvict(calendarTop);
  const queueAlive = useKeepAlive(queueTop, queueTop);
  const serviceAlive = useKeepAlive(serviceTop, serviceTop && !!service);
  const detailAlive = useKeepAlive(detailTop, !!meta);
  const personAlive = useKeepAlive(personTop, personId !== null);
  const collectionAlive = useKeepAlive(
    collectionTop,
    collectionId !== null,
    stackKinds.includes("collection"),
  );
  const episodeDetailAlive = useKeepAlive(
    episodeDetailTop,
    !!episodeDetail,
    stackKinds.includes("episode-detail"),
  );
  const { matchDetailGame } = useView();
  const matchDetailAlive = useKeepAlive(matchDetailTop, !!matchDetailGame);
  const filterAlive = useKeepAlive(filterTop, !!filter);
  const gridAlive = useKeepAlive(gridTop, !!grid, stackKinds.includes("grid"));
  const awardAlive = useKeepAlive(awardTop, awardTop);
  const animeAwardAlive = useKeepAlive(animeAwardTop, animeAwardTop && !!animeAwardSource);
  const pickerAlive = useKeepAlive(pickerTop, !!picker);
  const moviesAlive = useIdleEvict(moviesTop);
  const kidsAlive = useIdleEvict(kidsTop);
  const showsAlive = useIdleEvict(showsTop);
  const libraryAlive = useIdleEvict(libraryTop);
  const liveAlive = useIdleEvict(liveTop);
  const vodAlive = useIdleEvict(vodTop);
  const downloadsAlive = useIdleEvict(downloadsTop);

  return (
    <div data-kids={kidsTop || kid ? "on" : undefined} className="relative flex h-full">
      {!playerActive && !pickerTop && layout === "mobile" && <MobileTabBar />}
      {!settingsTop && !playerActive && !liveHidesRail && !pickerTop && layout === "sidebar" && <Sidebar />}
      {!settingsTop && !playerActive && !liveHidesRail && !pickerTop && layout === "dracula" && <DraculaSidebar />}
      {!settingsTop && !playerActive && !liveHidesRail && !pickerTop && layout === "nord" && <NordSidebar />}
      {!settingsTop && !playerActive && !liveHidesRail && !pickerTop && layout === "forest" && <ForestSidebar />}
      {!settingsTop && !playerActive && !liveHidesRail && !pickerTop && layout === "stremio" && <StremioRail />}
      {!settingsTop && !playerActive && !pickerTop && layout === "topdock" && <TopDock />}
      {!settingsTop && !playerActive && !pickerTop && layout === "cinematic" && <CinematicOverlay />}
      {!settingsTop && !playerActive && !pickerTop && layout === "royal" && <RoyalTopbar />}
      {!settingsTop && !playerActive && !pickerTop && layout === "rail" && <SideRail />}
      {!playerActive && !pickerTop && layout === "minui" && <MinUIDock />}
      {!playerActive && !pickerTop && layout === "topdock" && <FloatingBack offsetTop={92} />}
      {!playerActive && !pickerTop && layout === "cinematic" && <FloatingBack offsetTop={92} />}
      {!playerActive && !pickerTop && layout === "royal" && <FloatingBack offsetTop={92} />}
      {!playerActive && !pickerTop && layout === "rail" && <FloatingBack offsetLeft={settings.sidebarCollapsed ? 88 : 220} offsetTop={28} />}
      {!playerActive && !pickerTop && layout === "custom" && <FloatingBack offsetLeft={20} offsetTop={20} />}
      {/* The content half of the app is one region, so leaving it for the
          sidebar and coming back lands where you were, and so focus always has
          somewhere to return to when a view unmounts under it. */}
      <FocusSection
        focusKey={focusKeys.content}
        inert={playerActive}
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${playerActive ? "invisible" : ""}`}
      >
        <FocusLayer top={homeTop} className={layer(homeTop)} preferredChildFocusKey={HOME_HERO}>
          <Home active={homeTop} />
        </FocusLayer>
        {settingsAlive && (
          <FocusLayer top={settingsTop} className={layer(settingsTop)} preferredChildFocusKey={SETTINGS_NAV}>
            <Suspense fallback={null}>
              <Settings active={settingsTop} />
            </Suspense>
          </FocusLayer>
        )}
        {animeAlive && (
          <FocusLayer top={animeTop} className={layer(animeTop)} preferredChildFocusKey="row:anime:topPicks">
            <Suspense fallback={null}>
              <AnimeView active={animeTop} />
            </Suspense>
          </FocusLayer>
        )}
        {discoverAlive && (
          <FocusLayer top={discoverTop} className={layer(discoverTop)}>
            <Suspense fallback={null}>
              <Discover active={discoverTop} />
            </Suspense>
          </FocusLayer>
        )}
        {addonsAlive && (
          // Named rather than inferred: without it the screen opened with the
          // highlight still in the sidebar. The key is a string constant, not an
          // import of the lazy view, so naming the destination does not pull the
          // whole Addons bundle into the initial load.
          <FocusLayer top={addonsTop} className={layer(addonsTop)} preferredChildFocusKey="ADDONS_ADD">
            <Suspense fallback={null}>
              <AddonsView />
            </Suspense>
          </FocusLayer>
        )}
        {calendarAlive && (
          <FocusLayer top={calendarTop} className={layer(calendarTop)}>
            <Suspense fallback={null}>
              <CalendarView />
            </Suspense>
          </FocusLayer>
        )}
        {moviesAlive && (
          <FocusLayer top={moviesTop} className={layer(moviesTop)} preferredChildFocusKey={MOVIES_HERO}>
            <Suspense fallback={null}>
              <Movies active={moviesTop} />
            </Suspense>
          </FocusLayer>
        )}
        {kidsAlive && (
          <FocusLayer top={kidsTop} className={layer(kidsTop)}>
            <Suspense fallback={null}>
              <Kids active={kidsTop} />
            </Suspense>
          </FocusLayer>
        )}
        {showsAlive && (
          <FocusLayer top={showsTop} className={layer(showsTop)} preferredChildFocusKey={SHOWS_HERO}>
            <Suspense fallback={null}>
              <Shows active={showsTop} />
            </Suspense>
          </FocusLayer>
        )}
        {libraryAlive && (
          <FocusLayer top={libraryTop} className={layer(libraryTop)}>
            <Suspense fallback={null}>
              <LibraryView active={libraryTop} />
            </Suspense>
          </FocusLayer>
        )}
        {liveAlive && (
          <FocusLayer top={liveTop} className={layer(liveTop)}>
            <Suspense fallback={null}>
              <LiveView active={liveTop} />
            </Suspense>
          </FocusLayer>
        )}
        {vodAlive && (
          <FocusLayer top={vodTop} className={layer(vodTop)}>
            <Suspense fallback={null}>
              <PlaylistVodView active={vodTop} />
            </Suspense>
          </FocusLayer>
        )}
        {downloadsAlive && (
          <FocusLayer top={downloadsTop} className={layer(downloadsTop)}>
            <Suspense fallback={null}>
              <DownloadsView />
            </Suspense>
          </FocusLayer>
        )}
        {queueAlive && (
          <FocusLayer top={queueTop} className={layer(queueTop)}>
            <Suspense fallback={null}>
              <QueueView />
            </Suspense>
          </FocusLayer>
        )}
        {serviceAlive && service && (
          <FocusLayer top={serviceTop} className={layer(serviceTop)}>
            <Suspense fallback={null}>
              <ServiceView key={service} service={service} />
            </Suspense>
          </FocusLayer>
        )}
        {detailAlive && meta && (
          <FocusLayer top={detailTop} className={layer(detailTop)}>
            <Suspense fallback={null}>
              {kid ? (
                <KidsDetailView key={`kid-meta-${meta.id}`} meta={meta} episodeHint={metaEpisodeHint ?? undefined} />
              ) : (
                <DetailView key={`meta-${meta.id}`} meta={meta} liveContext={metaLiveContext} episodeHint={metaEpisodeHint ?? undefined} />
              )}
            </Suspense>
          </FocusLayer>
        )}
        {personAlive && personId !== null && (
          <FocusLayer top={personTop} className={layer(personTop)}>
            <Suspense fallback={null}>
              <PersonView key={`person-${personId}`} personId={personId} />
            </Suspense>
          </FocusLayer>
        )}
        {collectionAlive && collectionId !== null && (
          <FocusLayer top={collectionTop} className={layer(collectionTop)}>
            <Suspense fallback={null}>
              <CollectionView key={`collection-${collectionId}`} collectionId={collectionId} />
            </Suspense>
          </FocusLayer>
        )}
        {episodeDetailAlive && episodeDetail && (
          <FocusLayer top={episodeDetailTop} className={layer(episodeDetailTop)}>
            <Suspense fallback={null}>
              <EpisodeDetailView
                key={`episode-${episodeDetail.seriesId}-${episodeDetail.season}-${episodeDetail.episode}`}
                seriesId={episodeDetail.seriesId}
                season={episodeDetail.season}
                episode={episodeDetail.episode}
                seriesMeta={episodeDetail.seriesMeta}
              />
            </Suspense>
          </FocusLayer>
        )}
        {matchDetailAlive && matchDetailGame && (
          <FocusLayer top={matchDetailTop} className={layer(matchDetailTop)}>
            <Suspense fallback={null}>
              <MatchDetailView key={`match-${matchDetailGame.id}`} game={matchDetailGame} />
            </Suspense>
          </FocusLayer>
        )}
        {filterAlive && filter && (
          <FocusLayer top={filterTop} className={layer(filterTop)}>
            <Suspense fallback={null}>
              <FilterView key={filterReactKey(filter)} filter={filter} />
            </Suspense>
          </FocusLayer>
        )}
        {gridAlive && grid && (
          <FocusLayer top={gridTop} className={layer(gridTop)}>
            <Suspense fallback={null}>
              <GridView key={`grid-${grid.title}`} grid={grid} />
            </Suspense>
          </FocusLayer>
        )}
        {collectionsIndexAlive && (
          <FocusLayer top={collectionsIndexTop} className={layer(collectionsIndexTop)}>
            <Suspense fallback={null}>
              <CollectionsView />
            </Suspense>
          </FocusLayer>
        )}
        {awardAlive && awardType && (
          <FocusLayer top={awardTop} className={layer(awardTop)}>
            <Suspense fallback={null}>
              <AwardView key={`award-${awardType}`} awardType={awardType} />
            </Suspense>
          </FocusLayer>
        )}
        {animeAwardAlive && animeAwardSource && (
          <FocusLayer top={animeAwardTop} className={layer(animeAwardTop)}>
            <Suspense fallback={null}>
              <AnimeAwardView key={`anime-award-${animeAwardSource}`} sourceId={animeAwardSource} />
            </Suspense>
          </FocusLayer>
        )}
        {pickerAlive && picker && (
          <FocusLayer top={pickerTop} className={layer(pickerTop)} preferredChildFocusKey={focusKeys.pickerPrimary}>
            <Suspense fallback={null}>
              <PlayPicker
                key={`picker-${picker.meta.id}-${picker.episode?.season ?? ""}-${picker.episode?.episode ?? ""}-${picker.attempt ?? 0}-${picker.intent ?? "play"}`}
                meta={picker.meta}
                episode={picker.episode}
                autoPlay={picker.intent === "download" || picker.intent === "download-season" ? false : picker.autoPlay}
                attempt={picker.attempt}
                intent={picker.intent}
                resume={picker.resume}
              />
            </Suspense>
          </FocusLayer>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-24 bg-gradient-to-b from-canvas/85 via-canvas/40 to-transparent"
        />
        {!immersive && (themeHasTopbar || (settingsTop && layout !== "minui" && layout !== "custom")) && <Topbar />}
        {!immersive && layout === "rail" && !settingsTop && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-canvas/90 via-canvas/40 to-transparent"
          />
        )}
      </FocusSection>
      {player && (
        <Suspense fallback={null}>
          <PlayerView key={player.meta.id.startsWith("iptv:") ? "player-live" : `player-${player.meta.id}`} src={player} />
        </Suspense>
      )}
      <CustomCodeMount />
      <WebhookLoopMount />
      {!player && <OfflineBanner />}
    </div>
  );
}

export type { Frame };
