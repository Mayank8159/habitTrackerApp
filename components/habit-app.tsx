import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BASE_URL = 'https://hg1iywighj.execute-api.ap-south-1.amazonaws.com';
const SESSION_KEY = '@habitsApp/session';
const DAILY_GRID_SIZE = 28;

const GEMINI = {
	background: '#07111F',
	backgroundAlt: '#0B1730',
	surface: 'rgba(13, 24, 46, 0.82)',
	surfaceStrong: '#101E37',
	surfaceSoft: '#152848',
	border: 'rgba(138, 181, 255, 0.18)',
	borderStrong: 'rgba(155, 198, 255, 0.34)',
	text: '#F4F7FF',
	muted: '#B5C5E6',
	soft: '#8196C4',
	accent: '#5AA8FF',
	accentSoft: '#DCEAFF',
	accentViolet: '#8A7CFF',
	accentCyan: '#6FE3FF',
	success: '#7EE0C6',
	danger: '#FF7D8A',
	glowBlue: 'rgba(68, 154, 255, 0.36)',
	glowViolet: 'rgba(125, 93, 255, 0.24)',
	glowCyan: 'rgba(100, 227, 255, 0.22)',
	orbBlue: 'rgba(61, 143, 255, 0.3)',
	orbViolet: 'rgba(112, 89, 255, 0.24)',
	orbCyan: 'rgba(122, 226, 255, 0.18)',
} as const;

const DEFAULT_HABIT_COLORS: [string, string] = [GEMINI.accent, GEMINI.accentSoft];

const ICON_MAP = {
	CheckCircle2: 'check-circle',
	CirclePlus: 'plus-circle',
	Grid2x2: 'grid',
	LayoutGrid: 'grid',
	LogOut: 'log-out',
	PencilLine: 'edit-3',
	RefreshCw: 'refresh-cw',
	Sparkles: 'star',
	Trash2: 'trash-2',
} as const;

function LucideIcon({
	name,
	color,
	size,
	strokeWidth,
	style,
}: {
	name: keyof typeof ICON_MAP;
	color: string;
	size: number;
	strokeWidth: number;
	style?: any;
}) {
	return <Feather name={ICON_MAP[name]} color={color} size={size} style={style} />;
}

type AuthSession = {
	userId: string;
	email: string;
	timezone: string;
	token: string;
};

type ApiHabit = {
	habitId?: string;
	id?: string;
	title?: string;
	cardHeight?: number;
	colors?: string[] | { primary?: string; secondary?: string };
	streakCount?: number;
	streak?: number;
	progress?: number;
	completedToday?: boolean;
	lastCheckIn?: string | null;
	checkedInAt?: string[];
};

type Habit = {
	id: string;
	title: string;
	cardHeight: number;
	colors: [string, string];
	streak: number;
	progress: number;
	completedToday: boolean;
	lastCheckIn: string | null;
	checkedInAt: string[];
};

type HabitFormState = {
	title: string;
	cardHeight: string;
	primaryColor: string;
	secondaryColor: string;
};

type FloatingOrbProps = {
	color: string;
	style: object;
	duration: number;
	translateX: number;
	translateY: number;
	delay?: number;
	size: number;
};

const emptyForm = (): HabitFormState => ({
	title: '',
	cardHeight: '210',
	primaryColor: GEMINI.accent,
	secondaryColor: GEMINI.accentSoft,
});

function getDefaultTimezone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function createUserId(email: string) {
	const sanitized = email.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 5) || 'usr';

	return `usr_${sanitized}_${Math.random().toString(36).slice(2, 6)}`;
}

async function requestJson<T>(path: string, options?: RequestInit) {
	const response = await fetch(`${BASE_URL}${path}`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			...(options?.headers ?? {}),
		},
	});

	const text = await response.text();
	const data = text ? JSON.parse(text) : null;

	if (!response.ok) {
		const detail = data?.message || data?.detail || `Request failed with ${response.status}`;
		throw new Error(detail);
	}

	return data as T;
}

function normalizeColors(value: ApiHabit['colors'], fallback: [string, string]) {
	if (Array.isArray(value) && value.length >= 2) {
		return [value[0], value[1]] as [string, string];
	}

	if (value && typeof value === 'object') {
		return [value.primary ?? fallback[0], value.secondary ?? fallback[1]] as [string, string];
	}

	return fallback;
}

function normalizeHabit(habit: ApiHabit, index: number): Habit {
	const palette: [string, string] = index % 2 === 0 ? DEFAULT_HABIT_COLORS : [GEMINI.accentViolet, '#E6DFFF'];

	return {
		id: habit.habitId ?? habit.id ?? `habit_${index}`,
		title: habit.title ?? 'Untitled habit',
		cardHeight: Number(habit.cardHeight ?? 210),
		colors: normalizeColors(habit.colors, palette),
		streak: Number(habit.streak ?? habit.streakCount ?? 0),
		progress: Number(habit.progress ?? 0),
		completedToday: Boolean(habit.completedToday ?? habit.lastCheckIn),
		lastCheckIn: habit.lastCheckIn ?? null,
		checkedInAt: Array.isArray(habit.checkedInAt)
			? habit.checkedInAt
			: habit.lastCheckIn
				? [habit.lastCheckIn]
				: [],
	};
}

function buildGridValues(habit: Habit, size = DAILY_GRID_SIZE) {
	const filled = Math.min(size, Math.max(habit.streak, habit.checkedInAt.length, habit.progress));

	return Array.from({ length: size }, (_, index) => ({
		active: index < filled,
		muted: index >= filled && index % 5 === 0,
	}));
}

function MasonryColumns({
	habits,
	onSelect,
	selectedId,
}: {
	habits: Habit[];
	onSelect: (habitId: string) => void;
	selectedId: string | null;
}) {
	const columns = useMemo(() => {
		const left: Habit[] = [];
		const right: Habit[] = [];
		let leftHeight = 0;
		let rightHeight = 0;

		for (const habit of habits) {
			if (leftHeight <= rightHeight) {
				left.push(habit);
				leftHeight += habit.cardHeight;
			} else {
				right.push(habit);
				rightHeight += habit.cardHeight;
			}
		}

		return [left, right];
	}, [habits]);

	return (
		<View style={styles.masonryRow}>
			{columns.map((column, columnIndex) => (
				<View key={columnIndex} style={styles.masonryColumn}>
					{column.map((habit) => (
						<HabitCard
							key={habit.id}
							habit={habit}
							selected={selectedId === habit.id}
							onSelect={() => onSelect(habit.id)}
						/>
					))}
				</View>
			))}
		</View>
	);
}

function HabitCard({ habit, selected, onSelect }: { habit: Habit; selected: boolean; onSelect: () => void }) {
	const grid = buildGridValues(habit, 14);
	const motion = useScaleMotion(0.965);

	return (
		<AnimatedPressable
			onPress={onSelect}
			onPressIn={motion.onPressIn}
			onPressOut={motion.onPressOut}
			style={[
				styles.cardShell,
				selected && styles.cardSelected,
				selected && { borderColor: habit.colors[0], shadowColor: habit.colors[0] },
				motion.animatedStyle,
			]}
		>
			<View style={[styles.cardAccent, { backgroundColor: habit.colors[0] }]} />
			<View style={styles.cardInner}>
				<View style={styles.cardHeader}>
					<View style={styles.cardHeaderText}>
						<Text style={styles.cardTitle}>{habit.title}</Text>
						<Text style={styles.cardMeta}>{habit.streak} day streak</Text>
					</View>
					<View style={[styles.streakPill, { backgroundColor: habit.completedToday ? '#183D2D' : '#E7DCC8' }]}>
						<Text style={[styles.streakPillText, habit.completedToday && styles.streakPillTextDark]}>
							{habit.completedToday ? 'Done' : 'Open'}
						</Text>
					</View>
				</View>

				{selected ? (
					<View style={[styles.selectedBadge, { backgroundColor: habit.colors[0] }]}>
						<Text style={styles.selectedBadgeText}>Selected</Text>
					</View>
				) : null}

				<View style={styles.gridMini}>
					{grid.map((cell, index) => (
						<View
							key={index}
							style={[
								styles.gridCellMini,
								cell.active && { backgroundColor: habit.colors[0], borderColor: habit.colors[0] },
								cell.muted && !cell.active && styles.gridCellMuted,
							]}
						/>
					))}
				</View>

				<View style={styles.progressWrap}>
					<View
						style={[
							styles.progressFill,
							{ width: `${Math.max(12, Math.min(100, habit.progress || habit.streak * 4))}%`, backgroundColor: habit.colors[1] },
						]}
					/>
				</View>
				<Text style={styles.progressLabel}>{Math.max(habit.progress, habit.streak * 4)}% complete</Text>
			</View>
		</AnimatedPressable>
	);
}

function DetailGrid({ habit }: { habit: Habit }) {
	const values = buildGridValues(habit, 28);

	return (
		<View style={styles.detailGrid}>
			{values.map((cell, index) => (
				<View
					key={index}
					style={[
						styles.detailCell,
						cell.active && { backgroundColor: habit.colors[0], borderColor: habit.colors[0] },
						cell.muted && !cell.active && styles.detailCellMuted,
					]}
				/>
			))}
		</View>
	);
}

function MetricTile({ label, value, subtext }: { label: string; value: string; subtext: string }) {
	return (
		<View style={styles.metricTile}>
			<Text style={styles.metricLabel}>{label}</Text>
			<Text style={styles.metricValue}>{value}</Text>
			<Text style={styles.metricSubtext}>{subtext}</Text>
		</View>
	);
}

function GridLegend({ activeColor }: { activeColor: string }) {
	return (
		<View style={styles.legendRow}>
			<View style={styles.legendItem}>
				<View style={[styles.legendSwatch, { backgroundColor: activeColor }]} />
				<Text style={styles.legendText}>Active day</Text>
			</View>
			<View style={styles.legendItem}>
				<View style={styles.legendSwatchMuted} />
				<Text style={styles.legendText}>Rest day</Text>
			</View>
		</View>
	);
}

function useScaleMotion(active = 0.97) {
	const scale = useRef(new Animated.Value(1)).current;

	const animateTo = (toValue: number) => {
		Animated.spring(scale, {
			toValue,
			useNativeDriver: true,
			bounciness: 0,
			speed: 18,
		}).start();
	};

	return {
		animatedStyle: { transform: [{ scale }] },
		onPressIn: () => animateTo(active),
		onPressOut: () => animateTo(1),
	};
}

function FloatingOrb({ color, style, duration, translateX, translateY, delay = 0, size }: FloatingOrbProps) {
	const motion = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const animation = Animated.loop(
			Animated.sequence([
				Animated.delay(delay),
				Animated.timing(motion, {
					toValue: 1,
					duration,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
				Animated.timing(motion, {
					toValue: 0,
					duration,
					easing: Easing.inOut(Easing.sin),
					useNativeDriver: true,
				}),
			]),
		);

		animation.start();

		return () => animation.stop();
	}, [delay, duration, motion]);

	return (
		<Animated.View
			pointerEvents="none"
			style={[
				styles.orb,
				style,
				{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: color,
					opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.52, 0.88] }),
					transform: [
						{ translateX: motion.interpolate({ inputRange: [0, 1], outputRange: [0, translateX] }) },
						{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, translateY] }) },
						{ scale: motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
					],
				},
			]}
		/>
	);
}

function GeminiBackdrop() {
	return (
		<View pointerEvents="none" style={styles.backdropLayer}>
			<FloatingOrb color={GEMINI.orbBlue} style={styles.orbTopRight} duration={6200} translateX={-18} translateY={22} size={240} />
			<FloatingOrb color={GEMINI.orbViolet} style={styles.orbTopLeft} duration={7400} translateX={16} translateY={-18} delay={300} size={190} />
			<FloatingOrb color={GEMINI.orbCyan} style={styles.orbBottom} duration={6800} translateX={-10} translateY={-16} delay={900} size={210} />
			<View style={styles.backdropWash} />
		</View>
	);
}

function MotionButton({
	onPress,
	style,
	children,
	pressedScale = 0.98,
	}: {
	onPress?: () => void;
	style: any;
	children: ReactNode;
	pressedScale?: number;
}) {
	const motion = useScaleMotion(pressedScale);

	return (
		<AnimatedPressable onPress={onPress} onPressIn={motion.onPressIn} onPressOut={motion.onPressOut} style={[style, motion.animatedStyle]}>
			{children}
		</AnimatedPressable>
	);
}

export default function HabitApp() {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [habits, setHabits] = useState<Habit[]>([]);
	const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [message, setMessage] = useState('');
	const [transitioning, setTransitioning] = useState(false);
	const [authForm, setAuthForm] = useState({
		email: 'dev@example.com',
		timezone: getDefaultTimezone(),
	});
	const [form, setForm] = useState<HabitFormState>(emptyForm());
	const [editingId, setEditingId] = useState<string | null>(null);
	const screenMotion = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		void bootstrap();
	}, [bootstrap]);

	useEffect(() => {
		if (!session) {
			return;
		}

		void syncHabits(session);
	}, [session]);

	useEffect(() => {
		Animated.timing(screenMotion, {
			toValue: session ? 1 : 0,
			duration: 420,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		}).start();
	}, [screenMotion, session]);

	const selectedHabit = selectedHabitId ? habits.find((habit) => habit.id === selectedHabitId) ?? null : null;
	const activeTodayCount = habits.filter((habit) => habit.completedToday).length;
	const averageStreak = habits.length
		? Math.round(habits.reduce((total, habit) => total + habit.streak, 0) / habits.length)
		: 0;

	const bootstrap = useCallback(async () => {
		try {
			const stored = await AsyncStorage.getItem(SESSION_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as AuthSession;
				setSession(parsed);
				setTransitioning(false);
				screenMotion.setValue(1);
				setAuthForm({ email: parsed.email, timezone: parsed.timezone });
				return;
			}
		} catch (error) {
			console.warn('Failed to restore session', error);
		}
	}, [screenMotion]);

	async function saveSession(nextSession: AuthSession) {
		setSession(nextSession);
		await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
	}

	async function syncHabits(currentSession: AuthSession) {
		setLoading(true);
		setMessage('');
		try {
			const data = await requestJson<{ habits?: ApiHabit[]; data?: ApiHabit[]; items?: ApiHabit[] }>(`/habits?userId=${encodeURIComponent(currentSession.userId)}`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${currentSession.token}`,
				},
			});
			const source = data.habits ?? data.data ?? data.items ?? [];
			const normalized = source.map(normalizeHabit);
			setHabits(normalized);
			setSelectedHabitId((current) => current ?? normalized[0]?.id ?? null);
			setMessage(normalized.length ? 'Habits synced from the API.' : 'Your grid is empty. Create the first habit card.');
		} catch (error) {
			const fallback = error instanceof Error ? error.message : 'Unable to load habits';
			setMessage(fallback);
		}
		setLoading(false);
	}

	async function handleRegister() {
		const email = authForm.email.trim();
		if (!email) {
			Alert.alert('Email required', 'Enter an email to create the onboarding footprint.');
			return;
		}

		const userId = createUserId(email);
		const payload = { userId, email, timezone: authForm.timezone.trim() || getDefaultTimezone() };

		setLoading(true);
		setMessage('');
		try {
			setTransitioning(true);
			const response = await requestJson<Record<string, unknown>>('/auth/register', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			const token = String(response.token ?? response.accessToken ?? response.authToken ?? response.userId ?? userId);
			await saveSession({ userId, email, timezone: payload.timezone, token });
			setMessage('Registration complete. Your habit desk is ready.');
			setTimeout(() => setTransitioning(false), 420);
		} catch (error) {
			setTransitioning(false);
			const fallbackToken = userId;
			await saveSession({ userId, email, timezone: payload.timezone, token: fallbackToken });
			setMessage(error instanceof Error ? error.message : 'Registration succeeded locally.');
		}
		setLoading(false);
	}

	async function handleSubmitHabit() {
		if (!session) {
			return;
		}

		if (!form.title.trim()) {
			Alert.alert('Title required', 'Name the habit card before saving it.');
			return;
		}

		const title = form.title.trim();
		const createPayload = {
			userId: session.userId,
			title,
			cardHeight: 210,
			colors: {
				primary: GEMINI.accent,
				secondary: GEMINI.accentSoft,
			},
		};
		const editPayload = {
			userId: session.userId,
			title,
			cardHeight: Number(form.cardHeight) || 210,
			colors: {
				primary: form.primaryColor.trim() || GEMINI.accent,
				secondary: form.secondaryColor.trim() || GEMINI.accentSoft,
			},
		};

		setLoading(true);
		try {
			if (editingId) {
				await requestJson(`/habits/${editingId}`, {
					method: 'PATCH',
					headers: { Authorization: `Bearer ${session.token}` },
					body: JSON.stringify({
						userId: session.userId,
						title: editPayload.title,
						cardHeight: editPayload.cardHeight,
						colors: editPayload.colors,
					}),
				});
				setMessage(`Updated ${editPayload.title}.`);
			} else {
				const createdHabit = await requestJson<ApiHabit>('/habits/create', {
					method: 'POST',
					headers: { Authorization: `Bearer ${session.token}` },
					body: JSON.stringify(createPayload),
				});
				const normalizedCreatedHabit = normalizeHabit(createdHabit, 0);
				setHabits((current) => [normalizedCreatedHabit, ...current.filter((habit) => habit.id !== normalizedCreatedHabit.id)]);
				setSelectedHabitId(normalizedCreatedHabit.id);
				setMessage(`Created ${title}.`);
			}
			setForm(emptyForm());
			setEditingId(null);
			await syncHabits(session);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Unable to save habit.');
		} finally {
			setLoading(false);
		}
	}

	async function handleCheckIn(habitId: string) {
		if (!session) {
			return;
		}

		try {
			await requestJson('/habits/check-in', {
				method: 'POST',
				headers: { Authorization: `Bearer ${session.token}` },
				body: JSON.stringify({ userId: session.userId, habitId }),
			});
			setMessage('Check-in saved.');
			await syncHabits(session);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Unable to check in.');
		}
	}

	async function handleDeleteHabit(habitId: string) {
		if (!session) {
			return;
		}

		try {
			await requestJson(`/habits/${habitId}?userId=${encodeURIComponent(session.userId)}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${session.token}` },
			});
			setMessage('Habit removed.');
			if (editingId === habitId) {
				setEditingId(null);
				setForm(emptyForm());
			}
			await syncHabits(session);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : 'Unable to delete habit.');
		}
	}

	function startEdit(habit: Habit) {
		setEditingId(habit.id);
		setForm({
			title: habit.title,
			cardHeight: String(habit.cardHeight),
			primaryColor: habit.colors[0],
			secondaryColor: habit.colors[1],
		});
	}

	async function handleRefresh() {
		if (!session) {
			return;
		}

		setRefreshing(true);
		await syncHabits(session);
		setRefreshing(false);
	}

	if (!session) {
		return (
			<SafeAreaView style={styles.screen}>
				<GeminiBackdrop />
				<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
					<Animated.View
						style={[
							styles.sceneWrap,
							{
								opacity: screenMotion.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
								transform: [{ translateY: screenMotion.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }],
							},
						]}
						pointerEvents={transitioning ? 'none' : 'auto'}
					>
						<ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
							<View style={styles.authFrame}>
						<View style={styles.heroCard}>
							<Text style={styles.kicker}>Gemini workspace</Text>
							<Text style={styles.heroTitle}>Register once, then run the whole routine from a glowing habit cockpit.</Text>
							<Text style={styles.heroBody}>
								The first run creates your onboarding footprint. After that, the app loads your habits, streaks, and masonry cards from the API.
							</Text>
							<View style={styles.legendRow}>
								<View style={styles.legendItem}>
									<View style={[styles.legendSwatch, { backgroundColor: GEMINI.accent }]} />
									<Text style={styles.legendText}>Blue light pulse</Text>
								</View>
								<View style={styles.legendItem}>
									<View style={styles.legendSwatchMuted} />
									<Text style={styles.legendText}>Soft glow rest state</Text>
								</View>
							</View>
						</View>

						<View style={styles.panel}>
							<Text style={styles.panelTitle}>Registration</Text>
							<View style={styles.panelHintRow}>
								<Text style={styles.panelHint}>Step 1</Text>
								<Text style={styles.panelHint}>Create your onboarding footprint</Text>
							</View>
							<TextInput
								placeholder="dev@example.com"
								placeholderTextColor={GEMINI.soft}
								style={styles.input}
								value={authForm.email}
								onChangeText={(value) => setAuthForm((current) => ({ ...current, email: value }))}
								autoCapitalize="none"
								keyboardType="email-address"
							/>
							<TextInput
								placeholder="Asia/Kolkata"
								placeholderTextColor={GEMINI.soft}
								style={styles.input}
								value={authForm.timezone}
								onChangeText={(value) => setAuthForm((current) => ({ ...current, timezone: value }))}
							/>
							<MotionButton onPress={handleRegister} style={styles.primaryButton}>
								<View style={styles.buttonRow}>
									<LucideIcon style={styles.icon} name="CirclePlus" size={16} color={GEMINI.background} strokeWidth={2.4} />
									<Text style={styles.primaryButtonText}>{loading ? 'Registering...' : 'Create onboarding footprint'}</Text>
								</View>
							</MotionButton>
							<Text style={styles.helperText}>Payload: userId, email, and timezone are sent to /auth/register.</Text>
						</View>
						{message ? <Text style={styles.statusText}>{message}</Text> : null}
							</View>
						</ScrollView>
					</Animated.View>
				</KeyboardAvoidingView>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
				<GeminiBackdrop />
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
				<Animated.View
					style={[
						styles.sceneWrap,
						{
							opacity: screenMotion,
							transform: [{ translateY: screenMotion.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
						},
					]}
				>
					<ScrollView
						contentContainerStyle={styles.content}
						refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#D7B98D" />}
						showsVerticalScrollIndicator={false}
					>
					<View style={styles.topBar}>
						<View>
							<Text style={styles.kicker}>Daily operating board</Text>
							<Text style={styles.boardTitle}>{session.email}</Text>
							<Text style={styles.boardMeta}>
								{session.timezone} | {habits.length} active habits
							</Text>
						</View>
						<MotionButton
							onPress={() => {
								setSession(null);
								AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
							}}
							style={styles.ghostButton}
						>
							<View style={styles.buttonRow}>
								<LucideIcon style={styles.icon} name="LogOut" size={15} color={GEMINI.accentSoft} strokeWidth={2.3} />
								<Text style={styles.ghostButtonText}>Reset</Text>
							</View>
						</MotionButton>
					</View>

					<View style={styles.metricRail}>
						<MetricTile label="Today" value={String(activeTodayCount)} subtext="completed habits" />
						<MetricTile label="Total" value={String(habits.length)} subtext="habit cards" />
						<MetricTile label="Avg streak" value={`${averageStreak}`} subtext="days across the set" />
					</View>

					<View style={styles.heroPanel}>
						<View style={styles.heroPanelHeader}>
							<View>
								<Text style={styles.panelTitle}>Gemini streak grid</Text>
								<Text style={styles.panelSubtitle}>Pick a card, then inspect the contribution board for that habit.</Text>
							</View>
							{selectedHabit ? (
								<View style={[styles.pill, { backgroundColor: selectedHabit.colors[0] }]}>
									<Text style={styles.pillText}>{selectedHabit.streak} day streak</Text>
								</View>
							) : null}
						</View>

						{selectedHabit ? (
							<>
								<GridLegend activeColor={selectedHabit.colors[0]} />
								<Text style={styles.detailTitle}>{selectedHabit.title}</Text>
								<Text style={styles.detailBody}>
									{Math.max(selectedHabit.progress, selectedHabit.streak * 4)}% complete, {selectedHabit.completedToday ? 'already checked in today.' : "ready for today's check-in."}
								</Text>
								<DetailGrid habit={selectedHabit} />
								<View style={styles.detailActions}>
									<MotionButton onPress={() => handleCheckIn(selectedHabit.id)} style={[styles.primaryButton, styles.flexButton]}>
												<View style={styles.buttonRow}>
													<LucideIcon style={styles.icon} name="CheckCircle2" size={16} color={GEMINI.background} strokeWidth={2.3} />
													<Text style={styles.primaryButtonText}>Check in</Text>
												</View>
									</MotionButton>
									<MotionButton onPress={() => startEdit(selectedHabit)} style={[styles.secondaryButton, styles.flexButton]}>
												<View style={styles.buttonRow}>
													<LucideIcon style={styles.icon} name="PencilLine" size={16} color={GEMINI.accentSoft} strokeWidth={2.3} />
													<Text style={styles.secondaryButtonText}>Edit habit</Text>
												</View>
									</MotionButton>
								</View>
							</>
						) : (
							<Text style={styles.helperText}>Create a habit card to unlock the streak board.</Text>
						)}
					</View>

					<View style={styles.panel}>
						<Text style={styles.panelTitle}>{editingId ? 'Edit habit' : 'Create habit'}</Text>
						<Text style={styles.panelSubtitle}>
							{editingId ? 'Adjust the card height and colors for this habit.' : 'Just give the habit a name to create it.'}
						</Text>
						<TextInput
							placeholder="Gym"
							placeholderTextColor={GEMINI.soft}
							style={styles.input}
							value={form.title}
							onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
						/>
						{editingId ? (
							<>
								<TextInput
									placeholder="210"
									placeholderTextColor={GEMINI.soft}
									style={styles.input}
									value={form.cardHeight}
									onChangeText={(value) => setForm((current) => ({ ...current, cardHeight: value }))}
									keyboardType="numeric"
								/>
								<View style={styles.colorRow}>
									<TextInput
										placeholder="#5AA8FF"
										placeholderTextColor={GEMINI.soft}
										style={[styles.input, styles.colorInput]}
										value={form.primaryColor}
										onChangeText={(value) => setForm((current) => ({ ...current, primaryColor: value }))}
										autoCapitalize="none"
									/>
									<TextInput
										placeholder="#DCEAFF"
										placeholderTextColor={GEMINI.soft}
										style={[styles.input, styles.colorInput]}
										value={form.secondaryColor}
										onChangeText={(value) => setForm((current) => ({ ...current, secondaryColor: value }))}
										autoCapitalize="none"
									/>
								</View>
							</>
						) : null}
						<View style={styles.detailActions}>
							<MotionButton onPress={handleSubmitHabit} style={[styles.primaryButton, styles.flexButton]}>
								<View style={styles.buttonRow}>
									<LucideIcon style={styles.icon} name="CirclePlus" size={16} color={GEMINI.background} strokeWidth={2.4} />
									<Text style={styles.primaryButtonText}>{editingId ? 'Save changes' : 'Add habit'}</Text>
								</View>
							</MotionButton>
							{editingId ? (
								<MotionButton
									onPress={() => {
									setEditingId(null);
									setForm(emptyForm());
								}}
									style={[styles.secondaryButton, styles.flexButton]}
								>
									<View style={styles.buttonRow}>
										<LucideIcon style={styles.icon} name="RefreshCw" size={16} color={GEMINI.accentSoft} strokeWidth={2.3} />
										<Text style={styles.secondaryButtonText}>Cancel</Text>
									</View>
								</MotionButton>
							) : null}
						</View>
						<Text style={styles.helperText}>
							Create uses POST /habits/create. Edit uses PATCH /habits/{'{'}habitId{'}'} with title, cardHeight, and colors as an object.
						</Text>
					</View>

					{message ? <Text style={styles.statusText}>{message}</Text> : null}

					<View style={styles.listHeader}>
						<View style={styles.sectionTitleRow}>
							<LucideIcon style={styles.icon} name="Grid2x2" size={16} color={GEMINI.accentSoft} strokeWidth={2.3} />
							<Text style={styles.panelTitle}>Habit masonry</Text>
						</View>
						<Text style={styles.boardMeta}>{loading ? 'Syncing...' : 'Pull to refresh from the API'}</Text>
					</View>

					{habits.length ? (
						<MasonryColumns
							habits={habits}
							selectedId={selectedHabitId}
							onSelect={(habitId) => setSelectedHabitId((current) => (current === habitId ? null : habitId))}
						/>
					) : (
						<View style={styles.emptyState}>
							<View style={styles.emptyIcon}>
								<LucideIcon style={styles.icon} name="LayoutGrid" size={22} color={GEMINI.accentSoft} strokeWidth={2.2} />
							</View>
							<Text style={styles.emptyTitle}>No habits yet</Text>
							<Text style={styles.emptyBody}>Use the create form above to add your first card, then check in to grow the grid.</Text>
						</View>
					)}

					{selectedHabit ? (
						<View style={[styles.selectedActionsPanel, { borderColor: selectedHabit.colors[0] }]}>
							<View style={styles.selectedActionsHeader}>
								<View style={styles.selectedActionsTitleRow}>
									<View style={[styles.selectedActionsIcon, { backgroundColor: selectedHabit.colors[0] }]}>
										<LucideIcon style={styles.selectedActionsIconGlyph} name="CheckCircle2" size={16} color={GEMINI.background} strokeWidth={2.3} />
									</View>
									<View style={styles.selectedActionsTextBlock}>
										<Text style={styles.panelTitle}>Selected habit actions</Text>
										<Text style={styles.selectedActionsSubtitle}>Quick actions for {selectedHabit.title}</Text>
									</View>
								</View>
								<View style={[styles.selectedActionsPill, { backgroundColor: selectedHabit.colors[0] }]}>
									<Text style={styles.selectedActionsPillText}>{selectedHabit.completedToday ? 'Checked in' : 'Active'}</Text>
								</View>
							</View>
							<View style={styles.detailActions}>
								<MotionButton onPress={() => handleCheckIn(selectedHabit.id)} style={[styles.primaryButton, styles.flexButton]}>
									<View style={[styles.buttonRow, styles.selectedButtonRow]}>
										<LucideIcon style={styles.selectedButtonIcon} name="CheckCircle2" size={16} color={GEMINI.background} strokeWidth={2.3} />
										<Text style={styles.primaryButtonText}>Atomic check-in</Text>
									</View>
								</MotionButton>
								<MotionButton onPress={() => handleDeleteHabit(selectedHabit.id)} style={[styles.dangerButton, styles.flexButton]}>
									<View style={[styles.buttonRow, styles.selectedButtonRow]}>
										<LucideIcon style={styles.selectedButtonIcon} name="Trash2" size={16} color={GEMINI.text} strokeWidth={2.3} />
										<Text style={styles.dangerButtonText}>Delete habit</Text>
									</View>
								</MotionButton>
							</View>
						</View>
					) : null}
					</ScrollView>
				</Animated.View>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: GEMINI.background,
	},
	flex: {
		flex: 1,
	},
	backdropLayer: {
		...StyleSheet.absoluteFillObject,
		overflow: 'hidden',
	},
	orb: {
		position: 'absolute',
		shadowOpacity: 0.6,
		shadowOffset: { width: 0, height: 18 },
		shadowRadius: 34,
		elevation: 14,
	},
	orbTopRight: {
		top: -50,
		right: -40,
	},
	orbTopLeft: {
		top: 130,
		left: -55,
	},
	orbBottom: {
		bottom: 60,
		right: '12%',
	},
	backdropWash: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(7, 17, 31, 0.48)',
	},
	brandRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	brandMark: {
		width: 48,
		height: 48,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: GEMINI.surfaceSoft,
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
		shadowColor: GEMINI.glowBlue,
		shadowOpacity: 0.45,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 4,
	},
	brandMarkText: {
		color: GEMINI.accentSoft,
		fontSize: 22,
		fontFamily: Fonts.rounded,
	},
	brandName: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	brandSubtext: {
		fontSize: 13,
		lineHeight: 18,
		color: GEMINI.muted,
		marginTop: 2,
	},
	sceneWrap: {
		flex: 1,
	},
	content: {
		padding: 20,
		paddingBottom: 48,
		gap: 16,
	},
	authContent: {
		padding: 20,
		paddingBottom: 48,
		gap: 16,
		flexGrow: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	authFrame: {
		width: '100%',
		maxWidth: 560,
		alignSelf: 'center',
		gap: 16,
	},
	heroCard: {
		padding: 20,
		borderRadius: 28,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.5,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 14 },
		elevation: 10,
		gap: 12,
	},
	heroTitle: {
		fontSize: 31,
		lineHeight: 37,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
		marginTop: 6,
	},
	heroBody: {
		fontSize: 15,
		lineHeight: 22,
		color: GEMINI.muted,
		marginTop: 12,
	},
	kicker: {
		fontSize: 12,
		textTransform: 'uppercase',
		letterSpacing: 2,
		fontWeight: '700',
		color: GEMINI.accentCyan,
	},
	panel: {
		padding: 18,
		borderRadius: 26,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.46,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 10 },
		elevation: 7,
		gap: 12,
	},
	heroPanel: {
		padding: 18,
		borderRadius: 28,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.48,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 10 },
		elevation: 7,
		gap: 12,
	},
	heroPanelHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: 12,
	},
	panelTitle: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	panelSubtitle: {
		fontSize: 14,
		lineHeight: 20,
		color: GEMINI.muted,
		marginTop: 4,
	},
	panelHintRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: 12,
		flexWrap: 'wrap',
	},
	panelHint: {
		fontSize: 12,
		color: GEMINI.soft,
		fontWeight: '700',
	},
	input: {
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
		borderRadius: 18,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		color: GEMINI.text,
		backgroundColor: GEMINI.surfaceStrong,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.2,
		shadowRadius: 1,
		shadowOffset: { width: 0, height: 1 },
		width: '100%',
	},
	primaryButton: {
		backgroundColor: GEMINI.accent,
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: GEMINI.glowBlue,
		shadowOpacity: 0.42,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 5 },
		elevation: 4,
		width: '100%',
	},
	primaryButtonText: {
		color: GEMINI.background,
		fontSize: 15,
		fontWeight: '700',
	},
	secondaryButton: {
		backgroundColor: GEMINI.surfaceStrong,
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	secondaryButtonText: {
		color: GEMINI.accentSoft,
		fontSize: 15,
		fontWeight: '700',
	},
	dangerButton: {
		backgroundColor: '#2D1930',
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dangerButtonText: {
		color: GEMINI.text,
		fontSize: 15,
		fontWeight: '700',
	},
	ghostButton: {
		backgroundColor: GEMINI.surfaceStrong,
		borderRadius: 999,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.24,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
		elevation: 2,
	},
	ghostButtonText: {
		color: GEMINI.accentSoft,
		fontWeight: '700',
	},
	buttonRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		flexWrap: 'nowrap',
	},
	icon: {
		marginRight: 10,
	},
	selectedActionsIconGlyph: {
		marginRight: 0,
	},
	selectedButtonRow: {
		gap: 8,
	},
	selectedButtonIcon: {
		marginRight: 0,
	},
	buttonPressed: {
		transform: [{ translateY: 1 }],
		opacity: 0.92,
	},
	statusText: {
		color: GEMINI.accentSoft,
		fontSize: 14,
		lineHeight: 20,
	},
	helperText: {
		color: GEMINI.muted,
		fontSize: 13,
		lineHeight: 19,
	},
	boardTitle: {
		fontSize: 22,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
		marginTop: 6,
	},
	boardMeta: {
		fontSize: 13,
		color: GEMINI.muted,
		marginTop: 4,
	},
	metricRail: {
		flexDirection: 'row',
		gap: 10,
	},
	metricTile: {
		flex: 1,
		padding: 14,
		borderRadius: 22,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.18,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 3,
		gap: 3,
	},
	metricLabel: {
		fontSize: 11,
		textTransform: 'uppercase',
		letterSpacing: 1.1,
		color: GEMINI.soft,
		fontWeight: '700',
	},
	metricValue: {
		fontSize: 26,
		lineHeight: 28,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	metricSubtext: {
		fontSize: 12,
		lineHeight: 16,
		color: GEMINI.muted,
	},
	legendRow: {
		flexDirection: 'row',
		gap: 12,
		flexWrap: 'wrap',
	},
	legendItem: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 999,
		backgroundColor: GEMINI.surfaceSoft,
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
	},
	legendSwatch: {
		width: 12,
		height: 12,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.16)',
	},
	legendSwatchMuted: {
		width: 12,
		height: 12,
		borderRadius: 4,
		backgroundColor: 'rgba(135, 167, 255, 0.18)',
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
	},
	legendText: {
		fontSize: 12,
		fontWeight: '700',
		color: GEMINI.text,
	},
	sectionTitleRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	topBar: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		gap: 12,
	},
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
	},
	pillText: {
		color: GEMINI.background,
		fontWeight: '700',
		fontSize: 12,
	},
	gridMini: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 4,
	},
	gridCellMini: {
		width: 11,
		height: 11,
		borderRadius: 3,
		borderWidth: 1,
		borderColor: 'rgba(155, 198, 255, 0.2)',
		backgroundColor: 'rgba(10, 22, 43, 0.96)',
	},
	gridCellMuted: {
		backgroundColor: 'rgba(99, 122, 184, 0.22)',
	},
	progressWrap: {
		height: 10,
		borderRadius: 999,
		backgroundColor: 'rgba(135, 167, 255, 0.16)',
		overflow: 'hidden',
	},
	progressFill: {
		height: '100%',
		borderRadius: 999,
	},
	progressLabel: {
		fontSize: 12,
		color: '#BFAE98',
		marginTop: 2,
	},
	cardShell: {
		borderRadius: 28,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		overflow: 'hidden',
		shadowColor: GEMINI.background,
		shadowOpacity: 0.34,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
		elevation: 5,
		marginBottom: 14,
	},
	cardPressed: {
		transform: [{ translateY: 1 }],
	},
	cardSelected: {
		borderWidth: 2,
		shadowOpacity: 0.42,
		backgroundColor: 'rgba(20, 34, 61, 0.99)',
		transform: [{ translateY: -2 }],
	},
	cardAccent: {
		height: 14,
	},
	cardInner: {
		padding: 16,
		gap: 12,
	},
	cardHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'flex-start',
		gap: 8,
	},
	cardHeaderText: {
		flex: 1,
	},
	cardTitle: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	cardMeta: {
		fontSize: 13,
		color: GEMINI.muted,
		marginTop: 4,
	},
	streakPill: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 7,
		backgroundColor: GEMINI.accentViolet,
	},
	streakPillText: {
		fontSize: 11,
		fontWeight: '700',
		color: GEMINI.text,
	},
	streakPillTextDark: {
		color: GEMINI.background,
	},
	detailGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginTop: 4,
	},
	detailCell: {
		width: 18,
		height: 18,
		borderRadius: 5,
		borderWidth: 1,
		borderColor: 'rgba(155, 198, 255, 0.22)',
		backgroundColor: 'rgba(10, 22, 43, 0.96)',
	},
	detailCellMuted: {
		backgroundColor: 'rgba(99, 122, 184, 0.22)',
	},
	colorRow: {
		flexDirection: 'row',
		gap: 12,
	},
	colorInput: {
		flex: 1,
	},
	detailTitle: {
		fontSize: 24,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	detailBody: {
		fontSize: 14,
		lineHeight: 20,
		color: GEMINI.muted,
	},
	detailActions: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		marginTop: 4,
	},
	flexButton: {
		flex: 1,
		minWidth: 140,
		marginBottom: 8,
		marginRight: 8,
	},
	masonryRow: {
		flexDirection: 'row',
		gap: 12,
	},
	masonryColumn: {
		flex: 1,
		gap: 12,
	},
	emptyState: {
		padding: 24,
		borderRadius: 24,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		borderColor: GEMINI.border,
		alignItems: 'center',
		gap: 8,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.24,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 8 },
		elevation: 3,
	},
	emptyIcon: {
		width: 44,
		height: 44,
		borderRadius: 16,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: GEMINI.surfaceSoft,
		borderWidth: 1,
		borderColor: GEMINI.borderStrong,
	},
	emptyTitle: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: GEMINI.text,
	},
	emptyBody: {
		fontSize: 14,
		lineHeight: 20,
		color: GEMINI.muted,
		textAlign: 'center',
	},
	listHeader: {
		gap: 4,
	},
	selectedBadge: {
		alignSelf: 'flex-start',
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		marginBottom: 2,
	},
	selectedBadgeText: {
		color: GEMINI.background,
		fontSize: 11,
		fontWeight: '800',
		textTransform: 'uppercase',
		letterSpacing: 0.8,
	},
	selectedActionsPanel: {
		padding: 16,
		borderRadius: 26,
		backgroundColor: GEMINI.surface,
		borderWidth: 1,
		shadowColor: GEMINI.background,
		shadowOpacity: 0.24,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 8 },
		elevation: 4,
		gap: 12,
	},
	selectedActionsHeader: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		gap: 12,
	},
	selectedActionsTitleRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
		flex: 1,
	},
	selectedActionsIcon: {
		width: 34,
		height: 34,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	selectedActionsTextBlock: {
		flex: 1,
	},
	selectedActionsSubtitle: {
		fontSize: 13,
		lineHeight: 18,
		color: GEMINI.muted,
		marginTop: 3,
	},
	selectedActionsPill: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
	},
	selectedActionsPillText: {
		color: GEMINI.background,
		fontSize: 11,
		fontWeight: '800',
	},
});
