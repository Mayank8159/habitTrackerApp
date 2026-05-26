import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Fonts } from '@/constants/theme';

const BASE_URL = 'https://hg1iywighj.execute-api.ap-south-1.amazonaws.com';
const SESSION_KEY = '@habitsApp/session';
const DAILY_GRID_SIZE = 28;

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
	streak?: number;
	progress?: number;
	completedToday?: boolean;
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
	checkedInAt: string[];
};

type HabitFormState = {
	title: string;
	cardHeight: string;
	primaryColor: string;
	secondaryColor: string;
};

const emptyForm = (): HabitFormState => ({
	title: '',
	cardHeight: '210',
	primaryColor: '#163527',
	secondaryColor: '#DDE8D8',
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
	const palette: [string, string] = index % 2 === 0 ? ['#184E31', '#CDE4C8'] : ['#5B3A29', '#EEDDC5'];

	return {
		id: habit.habitId ?? habit.id ?? `habit_${index}`,
		title: habit.title ?? 'Untitled habit',
		cardHeight: Number(habit.cardHeight ?? 210),
		colors: normalizeColors(habit.colors, palette),
		streak: Number(habit.streak ?? 0),
		progress: Number(habit.progress ?? 0),
		completedToday: Boolean(habit.completedToday),
		checkedInAt: Array.isArray(habit.checkedInAt) ? habit.checkedInAt : [],
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

	return (
		<Pressable
			onPress={onSelect}
			style={({ pressed }) => [styles.cardShell, selected && styles.cardSelected, pressed && styles.cardPressed]}
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
		</Pressable>
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

export default function HabitApp() {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [habits, setHabits] = useState<Habit[]>([]);
	const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [message, setMessage] = useState('');
	const [authForm, setAuthForm] = useState({
		email: 'dev@example.com',
		timezone: getDefaultTimezone(),
	});
	const [form, setForm] = useState<HabitFormState>(emptyForm());
	const [editingId, setEditingId] = useState<string | null>(null);

	useEffect(() => {
		void bootstrap();
	}, []);

	useEffect(() => {
		if (!session) {
			return;
		}

		void syncHabits(session);
	}, [session]);

	const selectedHabit = habits.find((habit) => habit.id === selectedHabitId) ?? habits[0] ?? null;
	const activeTodayCount = habits.filter((habit) => habit.completedToday).length;
	const averageStreak = habits.length
		? Math.round(habits.reduce((total, habit) => total + habit.streak, 0) / habits.length)
		: 0;

	async function bootstrap() {
		try {
			const stored = await AsyncStorage.getItem(SESSION_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as AuthSession;
				setSession(parsed);
				setAuthForm({ email: parsed.email, timezone: parsed.timezone });
				return;
			}
		} catch (error) {
			console.warn('Failed to restore session', error);
		}
	}

	async function saveSession(nextSession: AuthSession) {
		setSession(nextSession);
		await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
	}

	async function syncHabits(currentSession: AuthSession) {
		setLoading(true);
		setMessage('');
		try {
			const data = await requestJson<{ habits?: ApiHabit[]; data?: ApiHabit[]; items?: ApiHabit[] }>('/habits', {
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
			const response = await requestJson<Record<string, unknown>>('/auth/register', {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			const token = String(response.token ?? response.accessToken ?? response.authToken ?? response.userId ?? userId);
			await saveSession({ userId, email, timezone: payload.timezone, token });
			setMessage('Registration complete. Your habit desk is ready.');
		} catch (error) {
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

		const cardHeight = Number(form.cardHeight) || 210;
		const payload = {
			title: form.title.trim(),
			cardHeight,
			colors: [form.primaryColor.trim() || '#184E31', form.secondaryColor.trim() || '#DDE8D8'],
		};

		setLoading(true);
		try {
			if (editingId) {
				await requestJson(`/habits/${editingId}`, {
					method: 'PATCH',
					headers: { Authorization: `Bearer ${session.token}` },
					body: JSON.stringify({
						title: payload.title,
						cardHeight: payload.cardHeight,
						colors: {
							primary: payload.colors[0],
							secondary: payload.colors[1],
						},
					}),
				});
				setMessage(`Updated ${payload.title}.`);
			} else {
				await requestJson('/habits/create', {
					method: 'POST',
					headers: { Authorization: `Bearer ${session.token}` },
					body: JSON.stringify(payload),
				});
				setMessage(`Created ${payload.title}.`);
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
				body: JSON.stringify({ habitId }),
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
				<View style={styles.backdrop} />
				<View style={styles.backdropAlt} />
				<View style={styles.backdropGlow} />
				<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
					<ScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false}>
						<View style={styles.brandRow}>
							<View style={styles.brandMark}>
								<Text style={styles.brandMarkText}>H</Text>
							</View>
							<View>
								<Text style={styles.brandName}>Habit Desk</Text>
								<Text style={styles.brandSubtext}>Skeuomorphic habit tracking with a contribution-style streak view.</Text>
							</View>
						</View>
						<View style={styles.heroCard}>
							<Text style={styles.kicker}>Habit desk</Text>
							<Text style={styles.heroTitle}>Register once, then run the whole routine from a tactile habit grid.</Text>
							<Text style={styles.heroBody}>
								The first run creates your onboarding footprint. After that, the app loads your habits, streaks, and masonry cards from the API.
							</Text>
							<View style={styles.legendRow}>
								<View style={styles.legendItem}>
									<View style={[styles.legendSwatch, { backgroundColor: '#184E31' }]} />
									<Text style={styles.legendText}>Dense streaks</Text>
								</View>
								<View style={styles.legendItem}>
									<View style={styles.legendSwatchMuted} />
									<Text style={styles.legendText}>Open slots</Text>
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
								placeholderTextColor="#8F7F69"
								style={styles.input}
								value={authForm.email}
								onChangeText={(value) => setAuthForm((current) => ({ ...current, email: value }))}
								autoCapitalize="none"
								keyboardType="email-address"
							/>
							<TextInput
								placeholder="Asia/Kolkata"
								placeholderTextColor="#8F7F69"
								style={styles.input}
								value={authForm.timezone}
								onChangeText={(value) => setAuthForm((current) => ({ ...current, timezone: value }))}
							/>
							<Pressable onPress={handleRegister} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}>
								<Text style={styles.primaryButtonText}>{loading ? 'Registering...' : 'Create onboarding footprint'}</Text>
							</Pressable>
							<Text style={styles.helperText}>Payload: userId, email, and timezone are sent to /auth/register.</Text>
						</View>
						{message ? <Text style={styles.statusText}>{message}</Text> : null}
					</ScrollView>
				</KeyboardAvoidingView>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<View style={styles.backdrop} />
			<View style={styles.backdropAlt} />
			<View style={styles.backdropGlow} />
			<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
				<ScrollView
					contentContainerStyle={styles.content}
					refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#163527" />}
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
						<Pressable
							onPress={() => {
								setSession(null);
								AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
							}}
							style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
						>
							<Text style={styles.ghostButtonText}>Reset</Text>
						</Pressable>
					</View>

					<View style={styles.metricRail}>
						<MetricTile label="Today" value={String(activeTodayCount)} subtext="completed habits" />
						<MetricTile label="Total" value={String(habits.length)} subtext="habit cards" />
						<MetricTile label="Avg streak" value={`${averageStreak}`} subtext="days across the set" />
					</View>

					<View style={styles.heroPanel}>
						<View style={styles.heroPanelHeader}>
							<View>
								<Text style={styles.panelTitle}>GitHub-style streak grid</Text>
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
									<Pressable onPress={() => handleCheckIn(selectedHabit.id)} style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.buttonPressed]}>
										<Text style={styles.primaryButtonText}>Check in</Text>
									</Pressable>
									<Pressable onPress={() => startEdit(selectedHabit)} style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.buttonPressed]}>
										<Text style={styles.secondaryButtonText}>Edit habit</Text>
									</Pressable>
								</View>
							</>
						) : (
							<Text style={styles.helperText}>Create a habit card to unlock the streak board.</Text>
						)}
					</View>

					<View style={styles.panel}>
						<Text style={styles.panelTitle}>{editingId ? 'Edit habit' : 'Create habit'}</Text>
						<Text style={styles.panelSubtitle}>Card height controls the masonry balance; the colors set the card finish.</Text>
						<TextInput
							placeholder="Gym"
							placeholderTextColor="#8F7F69"
							style={styles.input}
							value={form.title}
							onChangeText={(value) => setForm((current) => ({ ...current, title: value }))}
						/>
						<TextInput
							placeholder="210"
							placeholderTextColor="#8F7F69"
							style={styles.input}
							value={form.cardHeight}
							onChangeText={(value) => setForm((current) => ({ ...current, cardHeight: value }))}
							keyboardType="numeric"
						/>
						<View style={styles.colorRow}>
							<TextInput
								placeholder="#163527"
								placeholderTextColor="#8F7F69"
								style={[styles.input, styles.colorInput]}
								value={form.primaryColor}
								onChangeText={(value) => setForm((current) => ({ ...current, primaryColor: value }))}
								autoCapitalize="none"
							/>
							<TextInput
								placeholder="#DDE8D8"
								placeholderTextColor="#8F7F69"
								style={[styles.input, styles.colorInput]}
								value={form.secondaryColor}
								onChangeText={(value) => setForm((current) => ({ ...current, secondaryColor: value }))}
								autoCapitalize="none"
							/>
						</View>
						<View style={styles.detailActions}>
							<Pressable onPress={handleSubmitHabit} style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.buttonPressed]}>
								<Text style={styles.primaryButtonText}>{editingId ? 'Save changes' : 'Add habit'}</Text>
							</Pressable>
							{editingId ? (
								<Pressable
									onPress={() => {
									setEditingId(null);
									setForm(emptyForm());
								}}
									style={({ pressed }) => [styles.secondaryButton, styles.flexButton, pressed && styles.buttonPressed]}
								>
									<Text style={styles.secondaryButtonText}>Cancel</Text>
								</Pressable>
							) : null}
						</View>
						<Text style={styles.helperText}>
							Create uses POST /habits/create. Edit uses PATCH /habits/{'{'}habitId{'}'} with title, cardHeight, and colors.
						</Text>
					</View>

					{message ? <Text style={styles.statusText}>{message}</Text> : null}

					<View style={styles.listHeader}>
						<Text style={styles.panelTitle}>Habit masonry</Text>
						<Text style={styles.boardMeta}>{loading ? 'Syncing...' : 'Pull to refresh from the API'}</Text>
					</View>

					{habits.length ? (
						<MasonryColumns habits={habits} selectedId={selectedHabit?.id ?? null} onSelect={setSelectedHabitId} />
					) : (
						<View style={styles.emptyState}>
							<View style={styles.emptyIcon}>
								<Text style={styles.emptyIconText}>+</Text>
							</View>
							<Text style={styles.emptyTitle}>No habits yet</Text>
							<Text style={styles.emptyBody}>Use the create form above to add your first card, then check in to grow the grid.</Text>
						</View>
					)}

					{selectedHabit ? (
						<View style={styles.panel}>
							<Text style={styles.panelTitle}>Selected habit actions</Text>
							<View style={styles.detailActions}>
								<Pressable onPress={() => handleCheckIn(selectedHabit.id)} style={({ pressed }) => [styles.primaryButton, styles.flexButton, pressed && styles.buttonPressed]}>
									<Text style={styles.primaryButtonText}>Atomic check-in</Text>
								</Pressable>
								<Pressable onPress={() => handleDeleteHabit(selectedHabit.id)} style={({ pressed }) => [styles.dangerButton, styles.flexButton, pressed && styles.buttonPressed]}>
									<Text style={styles.dangerButtonText}>Delete habit</Text>
								</Pressable>
							</View>
						</View>
					) : null}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: '#E6DDCF',
	},
	flex: {
		flex: 1,
	},
	backdrop: {
		position: 'absolute',
		top: -80,
		right: -80,
		width: 240,
		height: 240,
		borderRadius: 120,
		backgroundColor: '#D3E3D0',
		opacity: 0.95,
	},
	backdropAlt: {
		position: 'absolute',
		left: -70,
		bottom: 160,
		width: 180,
		height: 180,
		borderRadius: 90,
		backgroundColor: '#D9C2A3',
		opacity: 0.55,
	},
	backdropGlow: {
		position: 'absolute',
		left: '15%',
		top: '18%',
		width: 220,
		height: 220,
		borderRadius: 110,
		backgroundColor: '#F7EBCB',
		opacity: 0.18,
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
		backgroundColor: '#183D2D',
		borderWidth: 1,
		borderColor: '#0D241B',
		shadowColor: '#122017',
		shadowOpacity: 0.25,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 4,
	},
	brandMarkText: {
		color: '#F6F2E7',
		fontSize: 22,
		fontFamily: Fonts.rounded,
	},
	brandName: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: '#1B2B21',
	},
	brandSubtext: {
		fontSize: 13,
		lineHeight: 18,
		color: '#6B5F50',
		marginTop: 2,
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
	},
	heroCard: {
		padding: 20,
		borderRadius: 28,
		backgroundColor: '#F6F0E5',
		borderWidth: 1,
		borderColor: '#D0C0AA',
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.18,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 14 },
		elevation: 8,
		gap: 12,
	},
	heroTitle: {
		fontSize: 31,
		lineHeight: 37,
		fontFamily: Fonts.rounded,
		color: '#1D2D22',
		marginTop: 6,
	},
	heroBody: {
		fontSize: 15,
		lineHeight: 22,
		color: '#5E5447',
		marginTop: 12,
	},
	kicker: {
		fontSize: 12,
		textTransform: 'uppercase',
		letterSpacing: 2,
		fontWeight: '700',
		color: '#6A7D61',
	},
	panel: {
		padding: 18,
		borderRadius: 26,
		backgroundColor: '#F7F1E4',
		borderWidth: 1,
		borderColor: '#CDBFAF',
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.16,
		shadowRadius: 14,
		shadowOffset: { width: 0, height: 10 },
		elevation: 5,
		gap: 12,
	},
	heroPanel: {
		padding: 18,
		borderRadius: 28,
		backgroundColor: '#F6EEE0',
		borderWidth: 1,
		borderColor: '#CDBFAF',
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.14,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 10 },
		elevation: 5,
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
		color: '#1F3125',
	},
	panelSubtitle: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6A5D4E',
		marginTop: 4,
	},
	panelHintRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	panelHint: {
		fontSize: 12,
		color: '#736657',
		fontWeight: '700',
	},
	input: {
		borderWidth: 1,
		borderColor: '#C9B9A4',
		borderRadius: 18,
		paddingHorizontal: 14,
		paddingVertical: 12,
		fontSize: 15,
		color: '#1F3125',
		backgroundColor: '#FCF8F1',
		shadowColor: '#fff',
		shadowOpacity: 0.7,
		shadowRadius: 1,
		shadowOffset: { width: 0, height: 1 },
	},
	primaryButton: {
		backgroundColor: '#183D2D',
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#122017',
		shadowOpacity: 0.22,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 5 },
		elevation: 4,
	},
	primaryButtonText: {
		color: '#F6F2E7',
		fontSize: 15,
		fontWeight: '700',
	},
	secondaryButton: {
		backgroundColor: '#EADDC6',
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	secondaryButtonText: {
		color: '#384335',
		fontSize: 15,
		fontWeight: '700',
	},
	dangerButton: {
		backgroundColor: '#A93A33',
		borderRadius: 18,
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dangerButtonText: {
		color: '#FFF3ED',
		fontSize: 15,
		fontWeight: '700',
	},
	ghostButton: {
		backgroundColor: '#EFE4D4',
		borderRadius: 999,
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderWidth: 1,
		borderColor: '#C9B9A4',
		shadowColor: '#fff',
		shadowOpacity: 0.55,
		shadowRadius: 2,
		shadowOffset: { width: 0, height: 1 },
		elevation: 2,
	},
	ghostButtonText: {
		color: '#495345',
		fontWeight: '700',
	},
	buttonPressed: {
		transform: [{ translateY: 1 }],
		opacity: 0.92,
	},
	statusText: {
		color: '#31523C',
		fontSize: 14,
		lineHeight: 20,
	},
	helperText: {
		color: '#6B5F50',
		fontSize: 13,
		lineHeight: 19,
	},
	boardTitle: {
		fontSize: 22,
		fontFamily: Fonts.rounded,
		color: '#17231C',
		marginTop: 6,
	},
	boardMeta: {
		fontSize: 13,
		color: '#6C5D50',
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
		backgroundColor: '#F8F3E9',
		borderWidth: 1,
		borderColor: '#D4C3AE',
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.08,
		shadowRadius: 10,
		shadowOffset: { width: 0, height: 6 },
		elevation: 3,
		gap: 3,
	},
	metricLabel: {
		fontSize: 11,
		textTransform: 'uppercase',
		letterSpacing: 1.1,
		color: '#7B6D5F',
		fontWeight: '700',
	},
	metricValue: {
		fontSize: 26,
		lineHeight: 28,
		fontFamily: Fonts.rounded,
		color: '#17231C',
	},
	metricSubtext: {
		fontSize: 12,
		lineHeight: 16,
		color: '#6B5F50',
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
		backgroundColor: '#F8F2E8',
		borderWidth: 1,
		borderColor: '#D2C2AE',
	},
	legendSwatch: {
		width: 12,
		height: 12,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.08)',
	},
	legendSwatchMuted: {
		width: 12,
		height: 12,
		borderRadius: 4,
		backgroundColor: '#E7DDCF',
		borderWidth: 1,
		borderColor: '#D4C3AE',
	},
	legendText: {
		fontSize: 12,
		fontWeight: '700',
		color: '#5D5347',
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
		color: '#F7F1E4',
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
		borderColor: '#D6CBBB',
		backgroundColor: '#F7F1E4',
	},
	gridCellMuted: {
		backgroundColor: '#ECE3D4',
	},
	progressWrap: {
		height: 10,
		borderRadius: 999,
		backgroundColor: '#E3D6C5',
		overflow: 'hidden',
	},
	progressFill: {
		height: '100%',
		borderRadius: 999,
	},
	progressLabel: {
		fontSize: 12,
		color: '#6D5E51',
		marginTop: 2,
	},
	cardShell: {
		borderRadius: 28,
		backgroundColor: '#F6EEDF',
		borderWidth: 1,
		borderColor: '#CDBFAF',
		overflow: 'hidden',
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.12,
		shadowRadius: 16,
		shadowOffset: { width: 0, height: 8 },
		elevation: 5,
		marginBottom: 14,
	},
	cardPressed: {
		transform: [{ translateY: 1 }],
	},
	cardSelected: {
		borderColor: '#6A8F61',
		shadowOpacity: 0.22,
		backgroundColor: '#F9F3E8',
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
		color: '#1B2B21',
	},
	cardMeta: {
		fontSize: 13,
		color: '#6C5D50',
		marginTop: 4,
	},
	streakPill: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 7,
	},
	streakPillText: {
		fontSize: 11,
		fontWeight: '700',
		color: '#4D4136',
	},
	streakPillTextDark: {
		color: '#E9F1E5',
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
		borderColor: '#D6CBBB',
		backgroundColor: '#F7F1E4',
	},
	detailCellMuted: {
		backgroundColor: '#E9DFCF',
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
		color: '#1E2F24',
	},
	detailBody: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6A5D4E',
	},
	detailActions: {
		flexDirection: 'row',
		gap: 12,
	},
	flexButton: {
		flex: 1,
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
		backgroundColor: '#F7F1E4',
		borderWidth: 1,
		borderColor: '#CDBFAF',
		alignItems: 'center',
		gap: 8,
		shadowColor: '#3D2B1F',
		shadowOpacity: 0.08,
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
		backgroundColor: '#183D2D',
		borderWidth: 1,
		borderColor: '#102319',
	},
	emptyIconText: {
		color: '#F6F2E7',
		fontSize: 26,
		fontFamily: Fonts.rounded,
		marginTop: -2,
	},
	emptyTitle: {
		fontSize: 18,
		fontFamily: Fonts.rounded,
		color: '#1E2F24',
	},
	emptyBody: {
		fontSize: 14,
		lineHeight: 20,
		color: '#6A5D4E',
		textAlign: 'center',
	},
	listHeader: {
		gap: 4,
	},
});
