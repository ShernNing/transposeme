import { useReducer, useMemo } from "react";

// Centralized state machine for the transpose value cluster. Replaces four
// loosely-coupled useState calls in App.jsx with one reducer so the related
// fields (current slider value, last-applied value, in-flight pending value,
// and queued delta) move together and can't drift out of sync.
//
//   semitones        — current slider/target value
//   appliedSemitones — value of the audio currently loaded
//   pendingSemitones — value of an in-flight transpose (null when idle)
//   queuedDelta      — latest requested delta while a job is running

const initialState = {
  semitones: 0,
  appliedSemitones: 0,
  pendingSemitones: null,
  queuedDelta: 0,
};

function reducer(state, action) {
  switch (action.type) {
    case "setSemitones":
      return { ...state, semitones: action.value };
    case "setApplied":
      return { ...state, appliedSemitones: action.value };
    case "setPending":
      return { ...state, pendingSemitones: action.value };
    case "setQueuedDelta":
      return { ...state, queuedDelta: action.value };
    case "reset":
      return { ...initialState };
    default:
      return state;
  }
}

export default function useTransposeState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Stable setters (dispatch identity never changes) — safe as useCallback deps.
  const actions = useMemo(
    () => ({
      setSemitones: (value) => dispatch({ type: "setSemitones", value }),
      setAppliedSemitones: (value) => dispatch({ type: "setApplied", value }),
      setPendingSemitones: (value) => dispatch({ type: "setPending", value }),
      setQueuedDelta: (value) => dispatch({ type: "setQueuedDelta", value }),
      resetTranspose: () => dispatch({ type: "reset" }),
    }),
    [],
  );

  return { ...state, ...actions };
}
