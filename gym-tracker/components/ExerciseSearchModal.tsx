// components/ExerciseSearchModal.tsx
import React, { useMemo, useState } from 'react';
import { searchExercisesByName } from '@/utils/exerciseSearch';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import exercisesData from '@/assets/data/exercises.json';

export interface ExerciseItem {
  id: string;
  name: string;
  primaryMuscles: string[];
  [key: string]: any;
}

interface ExerciseSearchModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (exercise: ExerciseItem) => void;
}

export default function ExerciseSearchModal({
  visible,
  title = 'Add Exercise',
  onClose,
  onSelect,
}: ExerciseSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredExercises = useMemo(
    () =>
      searchQuery.trim().length > 0
        ? searchExercisesByName(exercisesData as ExerciseItem[], searchQuery, 25)
        : [],
    [searchQuery]
  );

  const handleSelect = (exercise: ExerciseItem) => {
    onSelect(exercise);
    setSearchQuery('');
  };

  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <TextInput
            style={styles.input}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
            placeholderTextColor="#666"
            autoFocus
            returnKeyType="search"
          />

          {/* Results List */}
          <FlatList
            data={filteredExercises}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultItem}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <View style={styles.resultTextWrap}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultMuscle}>
                    {item.primaryMuscles?.join(', ')}
                  </Text>
                </View>
                <Text style={styles.selectIcon}>+</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {searchQuery.trim().length > 0
                  ? 'No exercises found'
                  : 'Type to search exercises'}
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeBtn: {
    color: '#FF6B00',
    fontSize: 24,
  },
  input: {
    backgroundColor: '#000000',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  resultItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  resultTextWrap: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  resultMuscle: {
    fontSize: 12,
    color: '#888',
  },
  selectIcon: {
    color: '#FF6B00',
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginTop: 32,
  },
});
