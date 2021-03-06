import { useRef, useEffect, useCallback, useReducer } from "react";
import { defaultGetPace, paceFromWindup } from "./Pace";
import {
  isFinished,
  lastPlayedElement,
  next,
  fastForward,
  rewind,
  Windup,
  nextElement,
} from "../Windup";
import { onCharsFromWindup } from "./OnChar";

type WindupReducerState<M> = {
  windup: Windup<string, M>;
  didFinishOnce: boolean;
};

type WindupReducerAction<M> =
  | {
      type: "replace";
      windup: Windup<string, M>;
    }
  | {
      type: "next";
    }
  | {
      type: "rewind";
    }
  | {
      type: "fast-forward";
    }
  | {
      type: "finish";
    };

function initWindupState<M>(windup: Windup<string, M>): WindupReducerState<M> {
  return { windup, didFinishOnce: false };
}

type ReducerType<M> = (
  prevState: WindupReducerState<M>,
  action: WindupReducerAction<M>
) => WindupReducerState<M>;

function windupReducer<M>(
  state: WindupReducerState<M>,
  action: WindupReducerAction<M>
): WindupReducerState<M> {
  switch (action.type) {
    case "replace":
      return initWindupState(action.windup);
    case "next":
      return { ...state, windup: next(state.windup) };
    case "rewind":
      return { windup: rewind(state.windup), didFinishOnce: false };
    case "fast-forward":
      return { ...state, windup: fastForward(state.windup) };
    case "finish":
      return { ...state, didFinishOnce: true };
    default:
      return state;
  }
}

export interface HookMetadata {
  onChar?: (char: string) => void;
  pace?: (char: string, nextChar: string | undefined) => number;
}

export default function useWindup<M extends HookMetadata>(
  windupInit: Windup<string, M>,
  options: {
    onFinished?: () => void;
    skipped?: boolean;
  }
): {
  windup: Windup<string, M>;
  skip: () => void;
  rewind: () => void;
  isFinished: boolean;
} {
  const [{ windup, didFinishOnce }, dispatch] = useReducer<
    ReducerType<M>,
    Windup<string, M>
  >(windupReducer, windupInit, initWindupState);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const windupIsFinished = isFinished(windup);

  const skip = useCallback(() => {
    if (!windupIsFinished) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      dispatch({
        type: "fast-forward",
      });
    }
  }, [windupIsFinished]);

  const rewind = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    dispatch({ type: "rewind" });
  }, []);

  // If windup arg changes, we should reset
  useEffect(() => {
    dispatch({ type: "replace", windup: windupInit });
  }, [windupInit]);

  // If skipped is changes to true, we should skip
  // And if it's changed to false, we should restart
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (options.skipped) {
      dispatch({
        type: "fast-forward",
      });
    }
    if (options.skipped === false) {
      dispatch({ type: "rewind" });
    }
  }, [options.skipped]);

  // When the windup changes, onChar should fire
  useEffect(() => {
    const onChars = onCharsFromWindup(windup);
    const lastEl = lastPlayedElement(windup);
    if (onChars.length > 0 && lastEl) {
      onChars.forEach((onChar) => {
        onChar(lastEl);
      });
    }
  }, [windup]);

  // If windup finishes, the onFinished should fire
  useEffect(() => {
    // Put this in a new context so that the windup finishes visually before firing this
    if (didFinishOnce === false && windupIsFinished) {
      const timeout = setTimeout(() => {
        if (options.onFinished) {
          options.onFinished();
        }
        dispatch({ type: "finish" });
      }, 0);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [didFinishOnce, windupIsFinished, options]);

  // the windup effect itself
  useEffect(() => {
    if (!windupIsFinished) {
      const getPace = paceFromWindup(windup) || defaultGetPace;
      const lastEl = lastPlayedElement(windup);
      const nextEl = nextElement(windup);
      timeoutRef.current = setTimeout(
        () => {
          dispatch({ type: "next" });
        },
        lastEl ? getPace(lastEl, nextEl) : 0
      );
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [windup, windupIsFinished]);

  return {
    windup,
    skip,
    rewind,
    isFinished: windupIsFinished,
  };
}
