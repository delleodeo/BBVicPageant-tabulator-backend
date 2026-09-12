import { describe, expect, it } from 'vitest';
import { Contestant } from '../src/models/Contestant.js';

describe('candidate age', () => {
  it('allows a candidate to be created without an age', () => {
    const candidate = new Contestant({ contestantNumber: 'A01', name: 'Sample Candidate' });
    expect(candidate.validateSync()).toBeUndefined();
    expect(candidate.age).toBeUndefined();
  });

  it('allows a blank age stored as null', () => {
    const candidate = new Contestant({ contestantNumber: 'A02', name: 'Sample Candidate', age: null });
    expect(candidate.validateSync()).toBeUndefined();
    expect(candidate.age).toBeNull();
  });
});
