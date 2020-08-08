// @flow
import * as React from "react";

type Props = {
  size?: number,
  fill?: string,
  className?: string,
};

function Office365Logo({ size = 34, fill = "#FFF", className }: Props) {
  return (
    <svg
      fill={fill}
      width={size}
      height={size}
      viewBox="0 0 34 34"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M 17.941406 4 L 5 8.4003906 L 5 21.599609 L 10 19.949219 L 10 8.9492188 L 18 7.3007812 L 18 23.25 L 5 21.599609 L 17.941406 26 L 25 24.349609 L 25 5.6503906 L 17.941406 4 z" />
    </svg>
  );
}

export default Office365Logo;
