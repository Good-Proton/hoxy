/*
 * Copyright (c) 2015 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

export default function() {
  let resolve, reject, p = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  p.resolve = (arg) => {
    p.isPending = false
    p.isResolved = true
    p.resolve = () => { }
    p.reject = () => { }
    p.value = arg
    resolve(arg)
  }
  p.reject = (arg) => {
    p.isPending = false
    p.isRejected = true
    p.resolve = () => { }
    p.reject = () => { }
    p.value = arg
    reject(arg)
  }
  p.isResolved = false
  p.isRejected = false
  p.isPending = true
  return p
}
