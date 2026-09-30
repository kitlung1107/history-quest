import test from 'node:test';
import assert from 'node:assert/strict';
import { studentGrade, canPlayGrade, canSeeGrade } from './gradeAccess.ts';
const grades = [1, 2, 3, 4, 5, 6];
test('six student grades and teacher/admin access matrix', () => {
  const expected = [[1], [2], [3], [4], [4, 5], [4, 5, 6]];
  for (const grade of grades) {
    const identity = { profile: { className: grade <= 3 ? `${grade}A` : `S${grade}` } };
    assert.deepEqual(grades.filter(g => canPlayGrade(identity, g)), expected[grade - 1]);
    assert.deepEqual(grades.filter(g => canSeeGrade(identity, g)), grade < 4 ? grades : [4, 5, 6]);
  }
  assert.deepEqual(grades.filter(g => canPlayGrade({ teacher: true }, g)), grades);
  for (const value of [null, {}, { profile: { className: 'Other' } }]) {
    assert.equal(grades.some(g => canPlayGrade(value, g)), false);
  }
});
test('roster formats, Chinese classes, legacy senior classes and invalid identities', () => {
  for (const grade of grades) for (const text of [`${grade}A`, `S${grade}`, `${'一二三四五六'[grade - 1]}A`, `中${'一二三四五六'[grade - 1]}`, ` ${grade}a `]) {
    assert.equal(studentGrade(text), grade);
  }
  for (const text of ['', 'Other', '7A', 'S0', '12A', '中七', 'abc4', '4F']) assert.equal(studentGrade(text), null);
});
