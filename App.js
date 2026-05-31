import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, StatusBar } from 'react-native';

// Sense — first mobile milestone.
// Self-contained practice round with emoji placeholders for the animal photos,
// so it runs on your phone with ZERO backend. This proves the code->phone loop.
// Next steps: import the real game logic from @sense/core and load real animal
// images from the server's image system.

const QUESTIONS = [
  { emoji: '🦁', options: ['Lion', 'Tiger', 'Cheetah', 'Leopard'], correct: 0 },
  { emoji: '🐘', options: ['Rhino', 'Elephant', 'Hippo', 'Buffalo'], correct: 1 },
  { emoji: '🦒', options: ['Horse', 'Camel', 'Giraffe', 'Llama'], correct: 2 },
  { emoji: '🐧', options: ['Puffin', 'Penguin', 'Seal', 'Albatross'], correct: 1 },
  { emoji: '🦊', options: ['Wolf', 'Coyote', 'Dingo', 'Fox'], correct: 3 },
  { emoji: '🐢', options: ['Turtle', 'Tortoise', 'Terrapin', 'Iguana'], correct: 0 },
];

export default function App() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);

  const cur = QUESTIONS[i];

  function pick(idx) {
    if (picked !== null) return;
    setPicked(idx);
    setAnswered((a) => a + 1);
    if (idx === cur.correct) setScore((s) => s + 1);
  }
  function next() {
    setPicked(null);
    setI((prev) => (prev + 1) % QUESTIONS.length);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.brand}>SENSE</Text>
        <Text style={styles.sub}>Practice</Text>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.score}>{score} / {answered} correct</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.emoji}>{cur.emoji}</Text>
      </View>
      <Text style={styles.question}>What animal is this?</Text>

      <View style={styles.options}>
        {cur.options.map((opt, idx) => {
          const isCorrect = idx === cur.correct;
          const isPicked = idx === picked;
          let bg = '#FFFFFF', border = '#E5E7EB', color = '#111827';
          if (picked !== null) {
            if (isCorrect) { bg = '#DCFCE7'; border = '#22C55E'; color = '#166534'; }
            else if (isPicked) { bg = '#FEE2E2'; border = '#EF4444'; color = '#991B1B'; }
          }
          return (
            <Pressable key={idx} onPress={() => pick(idx)} style={[styles.opt, { backgroundColor: bg, borderColor: border }]}>
              <Text style={[styles.optText, { color }]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>

      {picked !== null && (
        <Pressable style={styles.next} onPress={next}>
          <Text style={styles.nextText}>{picked === cur.correct ? 'Correct!  Next →' : 'Next →'}</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginTop: 24 },
  brand: { fontSize: 34, fontWeight: '900', letterSpacing: 4, color: '#6C63FF' },
  sub: { fontSize: 13, color: '#9CA3AF', letterSpacing: 2, marginTop: 2 },
  scoreRow: { alignItems: 'center', marginTop: 8 },
  score: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, height: 200, alignItems: 'center', justifyContent: 'center', marginTop: 24, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  emoji: { fontSize: 110 },
  question: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center', marginTop: 20 },
  options: { marginTop: 16 },
  opt: { borderWidth: 2, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12 },
  optText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  next: { backgroundColor: '#111827', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  nextText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
